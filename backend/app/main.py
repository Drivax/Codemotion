"""Loopback-only local API. All source access is scoped to imported snapshots."""
import json
import logging
from pathlib import Path
from typing import Literal
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.analysis.repository_loader import Limits, safe_path
from app.services.jobs import JobStore

logger = logging.getLogger("codemotion")
app = FastAPI(title="CodeMotion", version="0.1.0")
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "testserver"])
ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST", "DELETE"], allow_headers=["Content-Type"])
store = JobStore()


@app.middleware("http")
async def protect(request: Request, call_next):
    origin = request.headers.get("origin")
    if origin and origin not in ORIGINS:
        return JSONResponse({"detail": "Origin not allowed"}, status_code=403)
    if request.method == "POST":
        limit = Limits().max_total_bytes * 2
        try:
            if int(request.headers.get("content-length", "0")) > limit:
                return JSONResponse({"detail": "Request size limit exceeded"}, status_code=413)
        except ValueError:
            return JSONResponse({"detail": "Invalid content length"}, status_code=400)
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > limit:
                return JSONResponse({"detail": "Request size limit exceeded"}, status_code=413)
        request._body = bytes(body)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


class ImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(default="repository", min_length=1, max_length=120)
    files: dict[str, str] | None = None
    github_url: str | None = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def validate_input(self):
        if bool(self.files) == bool(self.github_url):
            raise ValueError("Provide files or github_url, exclusively")
        if self.files:
            if len(self.files) > Limits().max_files:
                raise ValueError("Too many files")
            total = 0
            for path, content in self.files.items():
                safe_path(path)
                size = len(content.encode())
                total += size
                if size > Limits().max_file_bytes or total > Limits().max_total_bytes:
                    raise ValueError("File or repository size limit exceeded")
        return self


@app.get("/api/health")
def health():
    return {"status": "ok", "schema_version": "1.0", "mode": "static"}


@app.post("/api/repositories/import", status_code=202)
def import_repository(payload: ImportRequest):
    try:
        return store.submit(payload.model_dump())
    except ValueError as error:
        raise HTTPException(429, str(error)) from error


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str):
    if job_id not in store.jobs:
        raise HTTPException(404, "Job not found")
    return dict(store.jobs[job_id])


@app.delete("/api/jobs/{job_id}")
def cancel_job(job_id: str):
    if job_id not in store.jobs:
        raise HTTPException(404, "Job not found")
    return store.cancel(job_id)


def repository(repository_id: str):
    result = store.repositories.get(repository_id)
    if result is None:
        raise HTTPException(404, "Snapshot not found or evicted; import it again")
    return result


@app.get("/api/repositories/{repository_id}")
def summary(repository_id: str):
    result = repository(repository_id)
    return {"schema_version": result.schema_version, "repository": result.repository,
            "diagnostics": result.diagnostics, "metrics": result.metrics,
            "files": [{"path": f.path, "package": f.package, "parsed": f.parsed} for f in result.files]}


@app.get("/api/repositories/{repository_id}/graph")
def graph(repository_id: str, offset: int = Query(0, ge=0), limit: int = Query(500, ge=1, le=5000),
          kind: str | None = None, focus: str | None = None):
    result = repository(repository_id)
    nodes = [n for n in result.nodes if n.kind not in {"Operation", "CallSite", "Parameter", "Variable", "Attribute", "Repository"}]
    if kind:
        nodes = [n for n in nodes if n.kind == kind]
    if focus:
        adjacent = {focus}
        for edge in result.edges:
            if edge.source == focus or edge.target == focus:
                adjacent.update([edge.source, edge.target])
        nodes = [n for n in nodes if n.id in adjacent]
    total = len(nodes)
    nodes = nodes[offset:offset+limit]
    visible = {n.id for n in nodes}
    return {"nodes": nodes, "edges": [e for e in result.edges if e.source in visible and e.target in visible], "total": total}


@app.get("/api/repositories/{repository_id}/symbols")
def symbols(repository_id: str, kind: str | None = None, offset: int = Query(0, ge=0), limit: int = Query(500, ge=1, le=5000)):
    result = repository(repository_id)
    nodes = [n for n in result.nodes if n.kind in {"Class", "Function", "Method", "Module", "Attribute"} and (not kind or n.kind == kind)]
    return {"items": nodes[offset:offset+limit], "total": len(nodes)}


@app.get("/api/repositories/{repository_id}/symbols/{symbol_id}")
def symbol_details(repository_id: str, symbol_id: str):
    result = repository(repository_id)
    node = next((n for n in result.nodes if n.id == symbol_id), None)
    if node is None:
        raise HTTPException(404, "Symbol not found")
    return {"symbol": node, "children": [n for n in result.nodes if n.parent == symbol_id and n.kind != "Operation"],
            "relations": [e for e in result.edges if e.source == symbol_id or e.target == symbol_id]}


@app.get("/api/repositories/{repository_id}/flows/{symbol_id}")
def flow(repository_id: str, symbol_id: str):
    result = repository(repository_id)
    if symbol_id not in result.flows:
        raise HTTPException(404, "No analyzable function flow available")
    return result.flows[symbol_id]


@app.get("/api/repositories/{repository_id}/source")
def source(repository_id: str, path: str):
    result = repository(repository_id)
    found = next((f for f in result.files if f.path == path), None)
    if found is None:
        raise HTTPException(404, "File not in this snapshot")
    return found


@app.get("/api/repositories/{repository_id}/export")
def export(repository_id: str):
    result = repository(repository_id)
    data = result.model_dump(mode="json", exclude={"metrics"})
    return Response(json.dumps(data, sort_keys=True, ensure_ascii=False), media_type="application/json",
                    headers={"Content-Disposition": 'attachment; filename="codemotion-analysis.json"'})


@app.post("/api/examples/{name}", status_code=202)
def example(name: Literal["basic-functions", "object-oriented", "branching", "loops", "multi-module"]):
    root = Path(__file__).resolve().parents[2] / "examples" / name
    files = {p.relative_to(root).as_posix(): p.read_text(encoding="utf-8") for p in sorted(root.rglob("*.py"))}
    return import_repository(ImportRequest(name=name, files=files))
