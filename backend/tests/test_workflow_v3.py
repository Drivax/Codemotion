import tempfile
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from app.analysis.engine import AnalysisEngine
from app.services.queries import QueryIndex
from app.services.archive import SnapshotArchive
from app import main


@pytest.fixture
def tmp_path():
    root = Path(__file__).resolve().parents[2] / ".codemotion" / "test-temp"
    root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=root) as directory:
        yield Path(directory)


def analyze(code, extra=None):
    return AnalysisEngine().analyze({"main.py": code, **(extra or {})})


def flow(code):
    return next(iter(analyze(code).flows.values()))


def successors(graph, start):
    return [e.target for e in graph.edges if e.source == start and e.kind == "control"]


def test_return_finally_never_falls_through_to_normal_continuation():
    graph = flow("def f():\n try:\n  return 1\n finally:\n  cleanup()\n unreachable()")
    returned = next(o for o in graph.operations if o.kind == "return")
    lookup = {o.id: o for o in graph.operations}
    cleanup = successors(graph, returned.id)
    assert len(cleanup) == 1 and lookup[cleanup[0]].expression == "cleanup()"
    assert all(lookup[i].kind == "exit" for i in successors(graph, cleanup[0]))
    assert not any(o.expression == "unreachable()" for o in graph.operations)


def test_finally_return_overrides_pending_return():
    graph = flow("def f():\n try:\n  return 1\n finally:\n  return 2")
    first = next(o for o in graph.operations if o.expression == "return 1")
    lookup = {o.id: o for o in graph.operations}
    assert lookup[successors(graph, first.id)[0]].expression == "return 2"


def test_explicit_raise_goes_to_handler_and_else_only_to_normal_body():
    graph = flow("def f():\n try:\n  raise ValueError()\n except ValueError as err:\n  recover(err)\n else:\n  success()\n finally:\n  cleanup()")
    assert any(o.expression == "recover(err)" for o in graph.operations)
    assert not any(o.expression == "success()" for o in graph.operations)
    assert any(o.writes == ["err"] for o in graph.operations)


@pytest.mark.parametrize("jump", ["break", "continue"])
def test_loop_exits_traverse_finally(jump):
    graph = flow(f"def f(items):\n for item in items:\n  try:\n   {jump}\n  finally:\n   cleanup()")
    operation = next(o for o in graph.operations if o.kind == jump)
    lookup = {o.id: o for o in graph.operations}
    assert lookup[successors(graph, operation.id)[0]].expression == "cleanup()"


def test_with_exits_reverse_order_on_return():
    graph = flow("def f():\n with outer() as a, inner() as b:\n  return b")
    lookup = {o.id: o for o in graph.operations}
    returned = next(o for o in graph.operations if o.kind == "return")
    inner = lookup[successors(graph, returned.id)[0]]
    outer = lookup[successors(graph, inner.id)[0]]
    assert inner.kind == outer.kind == "context_exit"
    assert "inner()" in inner.expression and "outer()" in outer.expression
    assert any(o.kind == "context_enter" and o.writes == ["a"] for o in graph.operations)
    assert not inner.calls and not outer.calls


def test_match_capture_guard_and_wildcard():
    graph = flow("def f(value):\n match value:\n  case [x] if x > 0:\n   return x\n  case _:\n   return 0\n unreachable()")
    assert any(o.writes == ["x"] for o in graph.operations)
    guard = next(o for o in graph.operations if o.expression == "x > 0")
    assert len(successors(graph, guard.id)) == 2
    assert not any(o.expression == "unreachable()" for o in graph.operations)
    assert graph.limitations


def test_except_star_remains_explicitly_opaque():
    graph = flow("def f():\n try:\n  work()\n except* ValueError:\n  recover()")
    assert any(o.kind == "unknown" for o in graph.operations)
    assert any("TryStar" in message for message in graph.limitations)


@pytest.mark.parametrize("call", ["from pkg import exported as alias\ndef run(): return alias()", "import pkg as p\ndef run(): return p.exported()"])
def test_reexport_chain_and_module_alias(call):
    result = analyze(call, {"pkg/__init__.py": "from .bridge import forwarded as exported", "pkg/bridge.py": "from .impl import target as forwarded", "pkg/impl.py": "def target(): return 1"})
    target = next(n for n in result.nodes if n.name == "target" and n.kind == "Function")
    assert any(e.kind == "CALLS" and e.target == target.id for e in result.edges)


def test_cyclic_reexports_remain_unresolved():
    result = analyze("from a import f\ndef run(): return f()", {"a.py": "from b import f", "b.py": "from a import f"})
    assert not any(e.kind == "CALLS" and e.resolution == "resolved" for e in result.edges)


def test_comparison_detects_same_ids_but_changed_operations_and_removed_callers():
    before = analyze("def changed(x): return x+1\ndef removed(): return 1\ndef caller(): return removed()")
    after = analyze("def changed(x): return x+2\ndef caller(): return 1")
    result = QueryIndex(before).compare(QueryIndex(after))
    changed = next(r for r in result["path_compatibility"] if r["name"] == "main.changed")
    assert changed["before_id"] == changed["after_id"] and not changed["compatible"]
    removed = next(r for r in result["previous_impacts"] if r["symbol"].name == "removed")
    assert any(i["symbol"].name == "caller" for i in removed["impact"]["items"])


def test_backup_restores_snapshot_and_rejects_bad_hash(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "archive", SnapshotArchive(tmp_path))
    payload = analyze("def f(): return 42").model_dump(mode="json")
    with TestClient(main.app) as client:
        response = client.post("/api/snapshots/restore", json=payload)
        assert response.status_code == 200 and not response.json()["existing"]
        assert client.post("/api/snapshots/restore", json=payload).json()["existing"]
        payload["files"][0]["source"] = "def f(): return 43"
        assert client.post("/api/snapshots/restore", json=payload).status_code == 400


def test_conditional_reexport_is_candidate_through_module_alias():
    result = analyze("import pkg as p\ndef entry(): return p.exported()", {"pkg/__init__.py": "if enabled:\n from .impl import target as exported", "pkg/impl.py": "def target(): return 1"})
    target = next(n for n in result.nodes if n.name == "target" and n.kind == "Function")
    assert any(e.kind == "CALLS" and e.target == target.id and e.resolution == "candidate" for e in result.edges)
