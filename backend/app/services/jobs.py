"""Isolated, cancellable analysis jobs with bounded in-memory snapshot caching."""
import multiprocessing as mp
import queue
import threading
import time
import uuid
from collections import OrderedDict
from app.analysis.engine import AnalysisEngine
from app.analysis.repository_loader import Limits, RepositoryLoader, snapshot
from app.models.schema import Analysis


def analyze_worker(payload: dict, output):
    revision: str | None
    try:
        output.put({"progress": "Downloading pinned GitHub revision" if payload.get("github_url") else "Validating local source files"})
        if payload.get("github_url"):
            files, name, revision = RepositoryLoader().github(payload["github_url"], payload.get("github_ref"))
        else:
            files, name, revision = payload["files"], payload["name"], payload.get("revision")
        output.put({"progress": "Parsing AST, resolving symbols and building static flows"})
        output.put({"result": AnalysisEngine().analyze(files, name, revision).model_dump(mode="json")})
    except Exception as error:
        output.put({"error": f"{type(error).__name__}: {error}"[:700]})


class JobStore:
    def __init__(self, archive=None):
        self.archive = archive
        self.jobs: OrderedDict[str, dict] = OrderedDict()
        self.repositories: OrderedDict[str, Analysis] = OrderedDict()
        self.lock = threading.RLock()
        self.max_cache_bytes = 80_000_000

    def submit(self, payload: dict) -> dict:
        with self.lock:
            if sum(j["status"] in {"queued", "running"} for j in self.jobs.values()) >= 2:
                raise ValueError("Two analyses are already running; wait or cancel one")
            job_id = uuid.uuid4().hex
            job = {"id": job_id, "status": "queued", "progress": "Waiting for isolated worker", "repository_id": None, "error": None}
            self.jobs[job_id] = job
            while len(self.jobs) > 50:
                terminal = next((key for key, value in self.jobs.items() if value["status"] not in {"queued", "running"}), None)
                if terminal:
                    self.jobs.pop(terminal)
                else:
                    break
            threading.Thread(target=self._run, args=(job_id, payload), daemon=True).start()
            return dict(job)

    def _run(self, job_id: str, payload: dict):
        with self.lock:
            job = self.jobs[job_id]
            if job["status"] == "cancelled":
                return
            if payload.get("files") and not payload.get("force"):
                try:
                    digest = snapshot(RepositoryLoader().load(payload["files"]))[:24]
                    if digest in self.repositories:
                        job.update(status="completed", progress="Snapshot cache hit", repository_id=digest)
                        return
                except ValueError as error:
                    job.update(status="failed", error=str(error))
                    return
            job.update(status="running", progress="Parsing and resolving in an isolated process")
        context = mp.get_context("spawn")
        output = context.Queue(maxsize=1)
        process = context.Process(target=analyze_worker, args=(payload, output), daemon=True)
        process.start()
        deadline = time.monotonic() + Limits().timeout + 10
        try:
            while True:
                if job["status"] == "cancelled":
                    return
                if time.monotonic() > deadline:
                    job.update(status="failed", error="Analysis timed out", progress="Timeout")
                    return
                try:
                    message = output.get(timeout=0.1)
                except queue.Empty:
                    if not process.is_alive():
                        job.update(status="failed", error="Analysis worker stopped unexpectedly")
                        return
                    continue
                if "progress" in message:
                    job.update(progress=message["progress"])
                    continue
                if "error" in message:
                    job.update(status="failed", error=message["error"])
                else:
                    result = Analysis.model_validate(message["result"])
                    size = len(result.model_dump_json())
                    if size > self.max_cache_bytes:
                        job.update(status="failed", error="Analysis result exceeds cache budget")
                        return
                    with self.lock:
                        if job["status"] == "cancelled":
                            return
                        if self.archive is not None:
                            try:
                                self.archive.put(result)
                            except (OSError, ValueError) as error:
                                job.update(status="failed", error=f"Cannot persist snapshot: {error}")
                                return
                        self.repositories[result.repository.id] = result
                        while len(self.repositories) > 6 or sum(len(r.model_dump_json()) for r in self.repositories.values()) > self.max_cache_bytes:
                            self.repositories.popitem(last=False)
                        job.update(status="completed", progress="Analysis ready", repository_id=result.repository.id)
                return
        finally:
            if process.is_alive():
                process.terminate()
            process.join(timeout=2)
            output.close()

    def cancel(self, job_id):
        with self.lock:
            job = self.jobs[job_id]
            if job["status"] in {"queued", "running"}:
                job.update(status="cancelled", progress="Cancelled")
            return dict(job)
