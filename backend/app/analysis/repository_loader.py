"""Bounded input loading. Uploaded paths are never interpreted as server paths."""
import hashlib
import io
import os
import re
import stat
import tokenize
import zipfile
from dataclasses import dataclass
from pathlib import PurePosixPath
from urllib.parse import urlparse

import httpx
import pathspec

DEFAULT_IGNORES = {".git", ".venv", "venv", "__pycache__", "node_modules", "dist", "build", ".mypy_cache", ".pytest_cache"}


@dataclass(frozen=True)
class Limits:
    max_files: int = int(os.getenv("CODEMOTION_MAX_FILES", "2000"))
    max_file_bytes: int = int(os.getenv("CODEMOTION_MAX_FILE_BYTES", "1000000"))
    max_total_bytes: int = int(os.getenv("CODEMOTION_MAX_TOTAL_BYTES", "20000000"))
    max_download_bytes: int = int(os.getenv("CODEMOTION_MAX_DOWNLOAD_BYTES", "25000000"))
    max_archive_bytes: int = int(os.getenv("CODEMOTION_MAX_ARCHIVE_BYTES", "80000000"))
    timeout: float = float(os.getenv("CODEMOTION_TIMEOUT", "45"))
    max_nodes: int = int(os.getenv("CODEMOTION_MAX_NODES", "100000"))
    max_flow_nodes: int = int(os.getenv("CODEMOTION_MAX_FLOW_NODES", "2000"))


def safe_path(raw: str) -> str:
    if not raw or "\\" in raw or "\x00" in raw or ":" in raw:
        raise ValueError("Invalid relative file path")
    path = PurePosixPath(raw)
    if path.is_absolute() or any(p in {"..", "."} for p in raw.split("/")):
        raise ValueError("Path traversal is forbidden")
    return path.as_posix()


class RepositoryLoader:
    def __init__(self, limits: Limits | None = None):
        self.limits = limits or Limits()
        self.ignored: list[str] = []

    def load(self, files: dict[str, str]) -> dict[str, str]:
        limits = self.limits
        if len(files) > limits.max_files:
            raise ValueError("Too many files")
        total = 0
        specs = []
        for raw, content in files.items():
            path = safe_path(raw)
            size = len(content.encode("utf-8"))
            total += size
            if size > limits.max_file_bytes or total > limits.max_total_bytes:
                raise ValueError("Repository size limit exceeded")
            if PurePosixPath(path).name == ".gitignore":
                base = str(PurePosixPath(path).parent)
                specs.append(("" if base == "." else base + "/", pathspec.PathSpec.from_lines("gitwildmatch", content.splitlines())))
        result = {}
        for raw, content in sorted(files.items()):
            path = safe_path(raw)
            ignored = any(part in DEFAULT_IGNORES for part in PurePosixPath(path).parts)
            ignored |= any(path.startswith(base) and spec.match_file(path[len(base):]) for base, spec in specs)
            if ignored or not path.endswith(".py") or "\x00" in content:
                self.ignored.append(path)
                continue
            result[path] = content
        if not result:
            raise ValueError("No Python files found after ignore rules")
        return result

    def archive(self, payload: bytes) -> dict[str, str]:
        if len(payload) > self.limits.max_download_bytes:
            raise ValueError("Download size limit exceeded")
        files: dict[str, str] = {}
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            entries = archive.infolist()
            if len(entries) > self.limits.max_files * 4:
                raise ValueError("Too many archive entries")
            total = 0
            for info in entries:
                safe_path(info.filename.rstrip("/"))
                if stat.S_ISLNK(info.external_attr >> 16):
                    raise ValueError("Archive symlinks are forbidden")
                total += info.file_size
                if total > self.limits.max_archive_bytes:
                    raise ValueError("Expanded archive limit exceeded")
                if info.file_size > 100000 and info.file_size / max(info.compress_size, 1) > 200:
                    raise ValueError("Suspicious archive compression ratio")
                if info.is_dir():
                    continue
                parts = PurePosixPath(info.filename).parts
                if len(parts) < 2:
                    continue
                path = "/".join(parts[1:])
                if not (path.endswith(".py") or PurePosixPath(path).name == ".gitignore"):
                    continue
                if info.file_size > self.limits.max_file_bytes:
                    raise ValueError("File size limit exceeded")
                if path in files:
                    raise ValueError("Duplicate archive path")
                raw = archive.read(info)
                encoding, _ = tokenize.detect_encoding(io.BytesIO(raw).readline)
                files[path] = raw.decode(encoding)
        return self.load(files)

    def github(self, url: str, ref: str | None = None) -> tuple[dict[str, str], str, str]:
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.netloc != "github.com" or parsed.query or parsed.fragment:
            raise ValueError("Use https://github.com/owner/repository")
        match = re.fullmatch(r"/([A-Za-z0-9_-]+)/([A-Za-z0-9_.-]+)/?", parsed.path)
        if not match or match[2] in {".", ".."}:
            raise ValueError("Invalid GitHub repository URL")
        owner, repo = match.groups()
        repo = repo.removesuffix(".git")
        # Fixed HTTPS origins only, no redirects or user-controlled hosts.
        with httpx.Client(timeout=self.limits.timeout, follow_redirects=False, trust_env=False) as client:
            response = client.get(f"https://api.github.com/repos/{owner}/{repo}/commits", params={"per_page": 1, **({"sha": ref} if ref else {})})
            response.raise_for_status()
            revision = response.json()[0]["sha"]
            if not re.fullmatch(r"[0-9a-f]{40}", revision):
                raise ValueError("Invalid GitHub revision")
            chunks = bytearray()
            with client.stream("GET", f"https://codeload.github.com/{owner}/{repo}/zip/{revision}") as stream:
                stream.raise_for_status()
                for chunk in stream.iter_bytes():
                    chunks.extend(chunk)
                    if len(chunks) > self.limits.max_download_bytes:
                        raise ValueError("Download size limit exceeded")
        return self.archive(bytes(chunks)), repo, revision


def snapshot(files: dict[str, str]) -> str:
    digest = hashlib.sha256()
    for path, content in sorted(files.items()):
        digest.update(path.encode() + b"\0" + content.encode() + b"\0")
    return digest.hexdigest()
