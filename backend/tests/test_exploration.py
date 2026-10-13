"""Exploration regressions: complete snapshot queries, provenance and persistence."""
import json
import tempfile
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from app.analysis.engine import AnalysisEngine
from app.models.schema import Analysis
from app.services.archive import SnapshotArchive
from app.services.queries import QueryIndex
from app.main import app, store


@pytest.fixture
def tmp_path():
    root = Path(__file__).resolve().parents[2] / ".codemotion" / "test-temp"
    root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=root) as directory:
        yield Path(directory)


def fixture():
    a = AnalysisEngine().analyze({"pkg/a.py": "from .b import target\ndef entry():\n x = 3\n y = 8\n z = target(x, y)\n return z\n", "pkg/b.py": "def target(first, second):\n return first + second\n"})
    index = QueryIndex(a)
    entry = next(n for n in a.nodes if n.name == "entry" and n.kind == "Function")
    target = next(n for n in a.nodes if n.name == "target" and n.kind == "Function")
    return a, index, entry, target


def test_hierarchy_and_paginated_neighborhood_pin_focus():
    a, q, entry, target = fixture()
    assert q.hierarchy()["nodes"][0].kind == "Directory"
    assert {n.name for n in q.hierarchy("pkg")["nodes"]} == {"a.py", "b.py"}
    result = q.neighborhood(entry.id, "out", 1, ["CALLS"], limit=1, offset=1)
    assert entry.id in {n.id for n in result["nodes"]}
    assert target.id in {n.id for n in result["nodes"]}
    assert q.neighborhood(entry.id, "in", 1, ["CALLS"])["total"] == 1
    assert not q.neighborhood(entry.id, "out", 1, [""])["edges"]


def test_scoped_variables_do_not_bind_other_arguments_on_same_line():
    a, q, entry, target = fixture()
    result = q.variable(entry.id, "x")
    assert [b["parameter"].name for b in result["bindings"]] == ["first"]
    assert len(result["definitions"]) == 1
    assert all(o.source.file == "pkg/a.py" for o in result["operations"])
    assert q.variable(target.id, "x")["operations"] == []


def test_semantic_variable_and_unicode_columns():
    a = AnalysisEngine().analyze({"main.py": 'def target(x):\n return x\ndef main():\n café = 1\n text = "😀"; out = target(café)\n return out\n'})
    q = QueryIndex(a)
    line = a.files[0].source.splitlines()[4]
    column = len(line[:line.index("target")].encode("utf-16-le")) // 2
    assert q.semantic("main.py", 5, column)["targets"][0].name == "target"
    column = len(line[:line.index("café")].encode("utf-16-le")) // 2
    assert q.semantic("main.py", 5, column)["targets"][0].kind == "Variable"
    assert q.semantic("main.py", 5, 0)["targets"] == []


def test_complete_search_and_neighborhood_beyond_initial_graph():
    source = "\n".join(f"def fn{i:04}():\n return {i}" for i in range(1300))
    a = AnalysisEngine().analyze({"many.py": source})
    assert len(a.nodes) > 5000
    q = QueryIndex(a)
    hit = q.search("fn1099")["items"][0]
    assert q.neighborhood(hit["id"], limit=1)["nodes"][0].name == "fn1099"
    assert q.search("return 1099", "text")["total"] == 1
    first = q.search("fn", limit=20)
    second = q.search("fn", offset=20, limit=20)
    assert first["next_offset"] == 20 and not {n["id"] for n in first["items"]} & {n["id"] for n in second["items"]}


def test_impact_and_paths_provide_source_evidence():
    _, q, entry, target = fixture()
    impact = q.impact(target.id)
    item = next(i for i in impact["items"] if i["symbol"].id == entry.id)
    assert item["distance"] == 1 and item["path"][0].provenance.file == "pkg/a.py"
    paths = q.paths(entry.id, target.id, kinds=["CALLS"])
    assert len(paths["paths"]) == 1
    assert paths["paths"][0][0].kind == "CALLS"
    assert not q.paths(target.id, entry.id)["paths"]


def test_cycles_and_metric_thresholds():
    a = AnalysisEngine().analyze({"a.py": "import b\ndef run():\n return b.work()", "b.py": "import a\ndef work():\n return 1"})
    result = QueryIndex(a).diagnostics(long_lines=2)
    assert len(result["cycles"]) == 1
    assert len(result["cycles"][0]["evidence"]) == 2
    assert any(i["code"] == "long_function" and i["threshold"] == 2 for i in result["items"])
    assert result["call_resolution"]["resolved"] == 1


def test_snapshot_comparison_rejects_engine_mismatch():
    before = AnalysisEngine().analyze({"main.py": "def f(x):\n return x"})
    after = AnalysisEngine().analyze({"main.py": "def f(x, y=1):\n return x+y\ndef added():\n return f(1)"})
    result = QueryIndex(before).compare(QueryIndex(after))
    assert any(c["signature_changed"] for c in result["changed"])
    assert any(n.name == "added" for n in result["added"])
    assert result["relations_added"]
    after.engine_version = "other"
    with pytest.raises(ValueError, match="versions"):
        QueryIndex(before).compare(QueryIndex(after))


def test_archive_restart_validation_eviction_and_corruption(tmp_path):
    a, _, _, _ = fixture()
    archive = SnapshotArchive(tmp_path, budget=len(a.model_dump_json().encode()) + 100)
    archive.put(a)
    restarted = SnapshotArchive(tmp_path, archive.budget)
    assert restarted.get(a.repository.id).repository.snapshot == a.repository.snapshot
    assert restarted.list()["items"][0]["engine_version"] == "2.0"
    for invalid in ["../outside", "a" * 25, "x" * 24]:
        with pytest.raises(ValueError):
            restarted.delete(invalid)
    payload = a.model_dump()
    payload.pop("engine_version")
    restarted.path(a.repository.id).write_text(json.dumps(payload), encoding="utf-8")
    assert restarted.get(a.repository.id) is None
    restarted.path(a.repository.id).with_suffix('.meta').write_text('{"format":1}', encoding="utf-8")
    assert restarted.list()["items"] == []
    restarted.put(a)
    b = AnalysisEngine().analyze({"b.py": "def other():\n return 10"})
    restarted.put(b)
    assert restarted.get(a.repository.id) is None
    assert restarted.get(b.repository.id) is not None
    restarted.path(b.repository.id).write_text("broken", encoding="utf-8")
    assert restarted.get(b.repository.id) is None


def test_query_api_bounds_and_snapshot_scope():
    a, _, entry, _ = fixture()
    store.repositories[a.repository.id] = a
    client = TestClient(app)
    base = f"/api/repositories/{a.repository.id}"
    assert client.get(base + "/neighborhood", params={"focus": entry.id}).status_code == 200
    assert client.get(base + "/neighborhood", params={"depth": 999}).status_code == 422
    assert client.get(base + "/semantic", params={"file": "../outside.py", "line": 1, "column": 0}).status_code == 400
    assert client.get(base + "/search", params={"q": "entry"}).json()["total"] == 1
    assert client.get(base + "/references/absent").json()["usages"] == []
    assert client.get(base + "/impact/absent").status_code == 400
    del store.repositories[a.repository.id]


def test_archive_never_follows_links(tmp_path):
    archive = SnapshotArchive(tmp_path / "archive")
    outside = tmp_path / "outside.json"
    outside.write_text("private")
    try:
        Path(archive.directory / ("a" * 24 + ".json")).symlink_to(outside)
    except OSError:
        pytest.skip("Windows symlink creation unavailable")
    with pytest.raises(ValueError):
        archive.get("a" * 24)
    assert outside.read_text() == "private"


def test_analysis_new_fields_roundtrip():
    a, _, _, _ = fixture()
    assert Analysis.model_validate_json(a.model_dump_json()).references

def test_semantic_ambiguous_callable_alias_has_multiple_candidates():
    a = AnalysisEngine().analyze({"main.py": "def first():\n return 1\ndef second():\n return 2\ndef main(flag):\n if flag:\n  action = first\n else:\n  action = second\n return action()\n"})
    q = QueryIndex(a)
    result = q.semantic("main.py", 10, 8)
    assert {n.name for n in result["targets"]} >= {"first", "second"}
    assert result["references"][0].resolution == "candidate"


def test_variable_definitions_from_both_branches_are_kept_separate():
    a = AnalysisEngine().analyze({"main.py": "def main(flag):\n if flag:\n  value = 1\n else:\n  value = 2\n return value\n"})
    scope = next(n.id for n in a.nodes if n.kind == "Function")
    variable = QueryIndex(a).variable(scope, "value")
    assert len(variable["definitions"]) == 2
    ret = next(o for o in variable["operations"] if o.kind == "return")
    assert len([e for e in variable["edges"] if e.target == ret.id]) == 2


def test_hierarchy_aggregates_parallel_edges_without_external_false_targets():
    a = AnalysisEngine().analyze({"a/run.py": "from b.work import f\nimport external\ndef run():\n external.do()\n f()\n f()", "b/work.py": "def f():\n return 1"})
    q = QueryIndex(a)
    graph = q.hierarchy()
    assert len(graph["edges"]) == 1
    edge = graph["edges"][0]
    assert edge.kind == "GROUPED" and edge.provenance
    assert len(q.group_relations("a", "b")["items"]) >= 2
