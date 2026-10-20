"""Read-only exploration API. Every query is bounded and snapshot-scoped."""
from collections import OrderedDict
from threading import RLock
from typing import Literal
from fastapi import APIRouter, HTTPException, Query
from app.services.queries import QueryIndex
from app.services.documentation import documentation, compare_documentation_versions


def exploration_router(repository):
    router = APIRouter(prefix="/api/repositories")
    indexes: OrderedDict[str, QueryIndex] = OrderedDict()

    lock = RLock()

    def index(identifier):
        with lock:
            return cached_index(identifier)

    def cached_index(identifier):
        analysis = repository(identifier)
        if identifier not in indexes or indexes[identifier].analysis is not analysis:
            indexes[identifier] = QueryIndex(analysis)
        indexes.move_to_end(identifier)
        while len(indexes) > 2:
            indexes.popitem(last=False)
        return indexes[identifier]

    def run(identifier, method, *args, **kwargs):
        try:
            return getattr(index(identifier), method)(*args, **kwargs)
        except ValueError as error:
            raise HTTPException(400, str(error)) from error

    @router.get("/{identifier}/snippet")
    def snippet(identifier: str, file: str, line: int = Query(1, ge=1), count: int = Query(20, ge=1, le=80)):
        record = next((f for f in repository(identifier).files if f.path == file), None)
        if record is None:
            raise HTTPException(404, "Fichier absent du snapshot")
        lines = record.source.splitlines()
        if line > max(1, len(lines)):
            raise HTTPException(400, "Ligne absente du fichier")
        excerpt = "\n".join(lines[line - 1:line - 1 + count])
        return {"file": file, "line": line, "source": excerpt[:16000], "truncated": len(excerpt) > 16000 or line - 1 + count < len(lines)}

    @router.get("/{identifier}/documentation")
    def read_documentation(identifier: str, file: str = Query("", max_length=1000)):
        return documentation(repository(identifier), file)

    @router.get("/{identifier}/documentation/compare/{other}")
    def compare_documentation(identifier: str, other: str):
        return compare_documentation_versions(repository(identifier), repository(other))

    @router.get("/{identifier}/neighborhood")
    def neighborhood(identifier: str, focus: str | None = None, direction: Literal["in", "out", "both"] = "both",
                     depth: int = Query(1, ge=0, le=8), relations: str = "CALLS,INSTANTIATES,IMPORTS,INHERITS,CONTAINS",
                     limit: int = Query(100, ge=1, le=1000), offset: int = Query(0, ge=0), edge_limit: int = Query(1000, ge=1, le=5000), pin: str | None = None):
        return run(identifier, "neighborhood", focus, direction, depth, relations.split(","), limit, offset, edge_limit, pin)

    @router.get("/{identifier}/hierarchy")
    def hierarchy(identifier: str, prefix: str = "", limit: int = Query(100, ge=1, le=1000), offset: int = Query(0, ge=0)):
        return run(identifier, "hierarchy", prefix, limit, offset)

    @router.get("/{identifier}/group-relations")
    def group_relations(identifier: str, source: str, target: str, limit: int = Query(200, ge=1, le=1000)):
        return run(identifier, "group_relations", source, target, limit)

    @router.get("/{identifier}/search")
    def search(identifier: str, q: str = Query("", max_length=300), mode: Literal["symbols", "text"] = "symbols",
               limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0)):
        return run(identifier, "search", q, mode, offset, limit)

    @router.get("/{identifier}/variables/{function_id}")
    def variable(identifier: str, function_id: str, name: str = Query(..., max_length=300)):
        return run(identifier, "variable", function_id, name)

    @router.get("/{identifier}/semantic")
    def semantic(identifier: str, file: str, line: int = Query(..., ge=1), column: int = Query(..., ge=0)):
        return run(identifier, "semantic", file, line, column)

    @router.get("/{identifier}/references/{symbol}")
    def references(identifier: str, symbol: str, offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500)):
        found = index(identifier).by_target[symbol]
        return {"usages": found[offset:offset + limit], "usage_total": len(found), "offset": offset, "limit": limit, "truncated": offset + limit < len(found)}

    @router.get("/{identifier}/impact/{symbol}")
    def impact(identifier: str, symbol: str, depth: int = Query(4, ge=1, le=8), limit: int = Query(200, ge=1, le=1000)):
        return run(identifier, "impact", symbol, depth, limit)

    @router.get("/{identifier}/paths")
    def paths(identifier: str, start: str, target: str, depth: int = Query(6, ge=1, le=12), limit: int = Query(20, ge=1, le=100),
              relations: str = "CALLS,INSTANTIATES,IMPORTS,INHERITS"):
        return run(identifier, "paths", start, target, depth, limit, relations.split(","))

    @router.get("/{identifier}/architecture")
    def architecture(identifier: str, long_lines: int = Query(80, ge=1, le=10000), members: int = Query(20, ge=1, le=10000),
                     connections: int = Query(20, ge=1, le=10000)):
        return run(identifier, "diagnostics", long_lines, members, connections)

    @router.get("/{identifier}/compare/{other}")
    def compare(identifier: str, other: str):
        return run(identifier, "compare", index(other))

    return router
