"""Run the local API and web UI; stop both with Ctrl+C."""
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]


def main():
    python = ROOT / (".venv/Scripts/python.exe" if os.name == "nt" else ".venv/bin/python")
    node = shutil.which("node")
    next_cli = ROOT / "frontend/node_modules/next/dist/bin/next"
    if not python.exists() or not node or not next_cli.exists():
        raise SystemExit("Install dependencies first; see README.md")
    processes = []
    def stop(*_args):
        for process in reversed(processes):
            if process.poll() is None:
                process.terminate()
        for process in processes:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
    signal.signal(signal.SIGTERM, stop)
    try:
        env = {**os.environ, "NEXT_TELEMETRY_DISABLED": "1"}
        processes.append(subprocess.Popen([str(python), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"], cwd=ROOT, env=env))
        mode = "start" if "--production" in sys.argv else "dev"
        processes.append(subprocess.Popen([node, str(next_cli), mode, "--hostname", "127.0.0.1", "--port", "3000"], cwd=ROOT / "frontend", env=env))
        print("CodeMotion: http://127.0.0.1:3000 | API: http://127.0.0.1:8000/docs", flush=True)
        while all(p.poll() is None for p in processes):
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        stop()


if __name__ == "__main__":
    main()
