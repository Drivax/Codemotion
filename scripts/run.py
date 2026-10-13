"""Start loopback services; Ctrl+C stops this launcher's entire process tree."""
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]


def check_ports():
    for port in (8000, 3000):
        with socket.socket() as probe:
            try:
                probe.bind(("127.0.0.1", port))
            except OSError:
                raise SystemExit(f"Port {port} already occupied. Close the previous CodeMotion launcher (Ctrl+C), or inspect Get-NetTCPConnection -LocalPort {port}. No process was stopped.") from None


def main():
    python = ROOT / (".venv/Scripts/python.exe" if os.name == "nt" else ".venv/bin/python")
    node = shutil.which("node")
    next_cli = ROOT / "frontend/node_modules/next/dist/bin/next"
    if not python.exists() or not node or not next_cli.exists():
        raise SystemExit("Install dependencies first; see README.md")
    check_ports()
    processes = []
    job = None
    if os.name == "nt":
        from windows_job import WindowsJob
        job = WindowsJob()
    stopping = False
    def stop(*_args):
        nonlocal stopping
        if stopping:
            return
        stopping = True
        for process in reversed(processes):
            if process.poll() is None:
                try:
                    if os.name == "nt":
                        process.send_signal(signal.CTRL_BREAK_EVENT)
                    else:
                        os.killpg(process.pid, signal.SIGTERM)
                except (OSError, ProcessLookupError):
                    pass
        for process in processes:
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                if os.name != "nt":
                    os.killpg(process.pid, signal.SIGKILL)
        if job:
            job.close()
        for process in processes:
            process.wait(timeout=5)
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        env = {**os.environ, "NEXT_TELEMETRY_DISABLED": "1"}
        mode = "start" if "--production" in sys.argv else "dev"
        commands = [([str(python), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"], ROOT),
                    ([node, str(next_cli), mode, "--hostname", "127.0.0.1", "--port", "3000"], ROOT / "frontend")]
        for command, cwd in commands:
            process = subprocess.Popen(command, cwd=cwd, env=env, creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
                                       start_new_session=os.name != "nt")
            processes.append(process)
            if job:
                job.assign(process)
        print("CodeMotion: http://127.0.0.1:3000 | API: http://127.0.0.1:8000/docs | Ctrl+C stops both services", flush=True)
        while not stopping and all(p.poll() is None for p in processes):
            time.sleep(0.3)
    finally:
        stop()


if __name__ == "__main__":
    main()
