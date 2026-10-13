"""Read-only import and API validation of a user-selected Python project."""
import json
import os
from pathlib import Path
import sys
import time
import urllib.request

BASE = "http://127.0.0.1:8000/api"


def request(path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as response:
        return json.load(response)


def main():
    root = Path(sys.argv[1]).resolve()
    ignored = {".git", ".venv", "venv", "node_modules", "__pycache__", "dist", "build", ".mypy_cache", ".pytest_cache"}
    files = {}
    for directory, subdirs, names in os.walk(root):
        subdirs[:] = [n for n in subdirs if n not in ignored and not Path(directory, n).is_symlink()]
        for name in names:
            path = Path(directory, name)
            if (name.endswith(".py") or name == ".gitignore") and not path.is_symlink():
                files[path.relative_to(root).as_posix()] = path.read_text(encoding="utf-8-sig")
    started = time.perf_counter()
    job = request("/repositories/import", {"name": root.name, "files": files})
    while job["status"] in {"queued", "running"}:
        time.sleep(.5)
        job = request("/jobs/" + job["id"])
    if job["status"] != "completed":
        raise RuntimeError(job)
    identifier = job["repository_id"]
    base = "/repositories/" + identifier
    summary = request(base)
    report = {"repository": summary["repository"], "engine": summary["engine_version"], "metrics": summary["metrics"],
              "import_seconds": time.perf_counter() - started, "files": len(summary["files"]), "queries": {}}
    for name, path in {"hierarchy": "/hierarchy", "step_search": "/search?q=CreditLimitEnv.step", "architecture": "/architecture"}.items():
        before = time.perf_counter()
        result = request(base + path)
        report["queries"][name] = {"ms": (time.perf_counter() - before) * 1000, "bytes": len(json.dumps(result))}
        if name == "step_search":
            target = next(n for n in result["items"] if n["name"] == "step")
            report["step"] = target
    step = report["step"]["id"]
    for name, path in {"flow": "/flows/" + step, "neighborhood": "/neighborhood?focus=" + step,
                       "variable": "/variables/" + step + "?name=decision_pd", "impact": "/impact/" + step}.items():
        before = time.perf_counter()
        result = request(base + path)
        report["queries"][name] = {"ms": (time.perf_counter() - before) * 1000, "bytes": len(json.dumps(result))}
        if name == "flow":
            report["flow_operations"] = len(result["operations"])
        if name == "variable":
            report["decision_pd"] = {"definitions": len(result["definitions"]), "uses": len(result["uses"]), "bindings": len(result["bindings"])}
    output = Path(__file__).resolve().parents[1] / "docs" / "validation-v2.json"
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=True))


if __name__ == "__main__":
    main()
