"""Reproducible benchmark. Imported projects are read only and never executed."""
import argparse
import json
import tokenize
from pathlib import Path

from app.analysis.engine import AnalysisEngine
from app.analysis.repository_loader import DEFAULT_IGNORES

ROOT = Path(__file__).resolve().parents[1]


def load_folder(root: Path):
    files = {}
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.is_symlink():
            continue
        relative = path.relative_to(root)
        if any(p in DEFAULT_IGNORES for p in relative.parts):
            continue
        if path.suffix == ".py" or path.name == ".gitignore":
            if path.stat().st_size > 1_000_000:
                continue
            try:
                with tokenize.open(path) as stream:
                    files[relative.as_posix()] = stream.read()
            except (UnicodeError, SyntaxError):
                continue
    return files


def benchmark(files, name):
    result = AnalysisEngine().analyze(files, name)
    ids = {n.id for n in result.nodes}
    assert all(e.source in ids and e.target in ids for e in result.edges)
    return {"name": name, "files": len(result.files), **result.metrics,
        "json_bytes": len(result.model_dump_json().encode()),
        "classes": sum(n.kind == "Class" for n in result.nodes),
        "functions_methods": sum(n.kind in {"Function", "Method"} for n in result.nodes),
        "calls": sum(n.kind == "CallSite" for n in result.nodes),
        "resolved_calls": sum(n.kind == "CallSite" and n.metadata.get("resolution") == "resolved" for n in result.nodes),
        "candidate_calls": sum(n.kind == "CallSite" and n.metadata.get("resolution") == "candidate" for n in result.nodes),
        "parse_errors": sum(d.code == "parse_error" for d in result.diagnostics),
        "snapshot": result.repository.snapshot}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--repository", type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / "docs/benchmarks.json")
    args = parser.parse_args()
    rows = []
    for count in (10, 100, 500):
        files = {f"module_{i}.py": f"def transform_{i}(value):\n result=value*2\n if result>10:\n  result=result-1\n return result\n" for i in range(count)}
        rows.append(benchmark(files, f"synthetic-{count}"))
    if args.repository:
        rows.append(benchmark(load_folder(args.repository), args.repository.name))
    args.output.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print(json.dumps(rows, indent=2))
