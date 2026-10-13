"""Versioned local snapshot archive with an explicit byte budget and atomic writes."""
import json
import re
import threading
from pathlib import Path
from app.models.schema import Analysis


class SnapshotArchive:
    def __init__(self, directory: Path, budget=256_000_000):
        self.directory = directory.resolve()
        self.budget = budget
        self.lock = threading.RLock()
        self.directory.mkdir(parents=True, exist_ok=True)

    def path(self, identifier):
        if not re.fullmatch(r"[0-9a-f]{24}", identifier):
            raise ValueError("Invalid snapshot identifier")
        path = self.directory / (identifier + ".json")
        if path.is_symlink() or path.resolve().parent != self.directory:
            raise ValueError("Snapshot path leaves archive")
        return path

    def put(self, analysis):
        content = analysis.model_dump_json().encode("utf-8")
        if len(content) > self.budget:
            raise ValueError("Snapshot exceeds disk archive budget")
        with self.lock:
            path = self.path(analysis.repository.id)
            temporary = path.with_suffix(".tmp")
            if temporary.is_symlink():
                raise ValueError("Unexpected archive link")
            temporary.write_bytes(content)
            temporary.replace(path)
            metadata = {"format": 1, "repository": analysis.repository.model_dump(), "engine_version": analysis.engine_version, "bytes": len(content)}
            meta_tmp = path.with_suffix(".meta.tmp")
            if meta_tmp.is_symlink() or temporary.is_symlink():
                raise ValueError("Unexpected archive link")
            meta_tmp.write_text(json.dumps(metadata), encoding="utf-8")
            meta_tmp.replace(path.with_suffix(".meta"))
            files = sorted(self.directory.glob("*.json"), key=lambda p: p.stat().st_mtime)
            total = sum(p.stat().st_size for p in files)
            for old in files:
                if total <= self.budget:
                    break
                total -= old.stat().st_size
                self.delete(old.stem)

    def get(self, identifier):
        path = self.path(identifier)
        with self.lock:
            if not path.is_file() or path.stat().st_size > self.budget:
                return None
            try:
                payload = json.loads(path.read_bytes())
                if payload.get("engine_version") != "2.0":
                    return None
                result = Analysis.model_validate(payload)
                if result.repository.id != identifier or result.engine_version != "2.0":
                    return None
                return result
            except (ValueError, OSError):
                return None

    def list(self):
        with self.lock:
            items = []
            for path in sorted(self.directory.glob("*.meta"), key=lambda p: p.stat().st_mtime, reverse=True):
                try:
                    if path.stat().st_size > 10000 or not self.path(path.stem).is_file():
                        continue
                    item = json.loads(path.read_text(encoding="utf-8"))
                    if (isinstance(item, dict) and item.get("format") == 1 and isinstance(item.get("bytes"), int)
                            and 0 <= item["bytes"] <= self.budget and isinstance(item.get("repository"), dict)
                            and item["repository"].get("id") == path.stem):
                        items.append(item)
                except (ValueError, OSError):
                    continue
            return {"items": items, "budget_bytes": self.budget, "used_bytes": sum(i["bytes"] for i in items), "eviction": "oldest saved snapshot"}

    def delete(self, identifier):
        with self.lock:
            path = self.path(identifier)
            path.unlink(missing_ok=True)
            path.with_suffix(".meta").unlink(missing_ok=True)
