"""Run meaningful checks and optional browser tests against the real servers."""
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
PYTHON = ROOT / (".venv/Scripts/python.exe" if os.name == "nt" else ".venv/bin/python")
NODE = shutil.which("node")

def run(args, cwd=ROOT):
    print("+", " ".join(map(str, args)), flush=True)
    subprocess.run(list(map(str, args)), cwd=cwd, check=True)

if __name__ == "__main__":
    run([PYTHON, "-m", "ruff", "check", "backend", "scripts"])
    run([PYTHON, "-m", "mypy", "backend/app"])
    run([PYTHON, "-m", "pytest", "-q"])
    for cli, args in [("typescript/bin/tsc", ["--noEmit"]), ("eslint/bin/eslint.js", ["src"]), ("vitest/vitest.mjs", ["run"]), ("next/dist/bin/next", ["build"])]:
        run([NODE, ROOT / "frontend/node_modules" / cli, *args], ROOT / "frontend")
    if "--e2e" in sys.argv:
        run([NODE, ROOT / "frontend/node_modules/@playwright/test/cli.js", "test"], ROOT / "frontend")
