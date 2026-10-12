import io
import json
import stat
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from app.analysis.engine import AnalysisEngine
from app.analysis.repository_loader import Limits, RepositoryLoader, safe_path
from app.main import app, store
from app.models.schema import Analysis


def analyze(code, extra=None):
    return AnalysisEngine().analyze({"main.py": code, **(extra or {})})


def symbol(result, name, kind=None):
    return next(n for n in result.nodes if n.name == name and (kind is None or n.kind == kind))


def flow(result, name):
    return result.flows[symbol(result, name).id]


def test_basic_call_and_argument_binding():
    result = analyze("def double(x):\n return x*2\ndef main():\n a=10\n b=double(a)\n return b")
    assert any(e.kind == "CALLS" and e.source == symbol(result, "main", "Function").id and e.target == symbol(result, "double", "Function").id for e in result.edges)
    assert any(e.kind == "PASSES_ARGUMENT" and e.label == "a" for e in result.edges)
    graph = flow(result, "main")
    assert {e.label for e in graph.edges if e.kind == "data"} >= {"a", "b"}


@pytest.mark.parametrize("import_line,call", [("from helper import target", "target()"), ("from helper import target as alias", "alias()"), ("import helper as h", "h.target()")])
def test_import_aliases(import_line, call):
    result = analyze(f"{import_line}\ndef main():\n return {call}", {"helper.py": "def target():\n return 1"})
    target = symbol(result, "target", "Function")
    assert any(e.kind == "CALLS" and e.target == target.id and e.resolution == "resolved" for e in result.edges)


def test_relative_imports_and_namespaces():
    result = AnalysisEngine().analyze({"pkg/__init__.py": "", "pkg/a.py": "from .b import same\ndef main():\n return same()", "pkg/b.py": "def same():\n return 1", "other.py": "def same():\n return 2"})
    same = [n for n in result.nodes if n.kind == "Function" and n.name == "same"]
    assert len({n.id for n in same}) == 2
    assert any(e.kind == "CALLS" and e.target == next(n.id for n in same if n.source.file == "pkg/b.py") for e in result.edges)


def test_class_features_and_nested_symbols():
    result = analyze('''from dataclasses import dataclass
class Base:
 def run(self): return 1
class Other: pass
@dataclass
class Item(Base, Other):
 count: int = 3
 def __init__(self):
  self.value = 0.99
 @staticmethod
 def static(x): return x
 @classmethod
 def make(cls): return cls()
 @property
 def amount(self): return self.value
 class Nested: pass
 def use(self): return self.run()
def outer():
 def inner(): return 1
 return inner()
''')
    item = symbol(result, "Item")
    assert item.metadata["dataclass"]
    assert len([e for e in result.edges if e.source == item.id and e.kind == "INHERITS"]) == 2
    assert symbol(result, "value", "Attribute").metadata["literal"] == "0.99"
    assert symbol(result, "static", "Method").metadata["decorators"] == ["staticmethod"]
    assert symbol(result, "amount", "Method").metadata["decorators"] == ["property"]
    assert symbol(result, "Nested").parent == item.id
    assert symbol(result, "inner").parent == symbol(result, "outer").id
    assert any(e.kind == "CALLS" and e.target == symbol(result, "run", "Method").id for e in result.edges)


def test_receiver_and_unknown_are_honest():
    result = analyze('''class Engine:
 def start(self): return 1
class Car:
 def __init__(self): self.engine=Engine()
 def drive(self): return self.engine.start()
def unknown(obj): return obj.start()
''')
    assert any(e.kind == "INSTANTIATES" and e.target == symbol(result, "Engine", "Class").id for e in result.edges)
    assert any(e.kind == "CALLS" and e.target == symbol(result, "start", "Method").id and e.resolution == "candidate" for e in result.edges)
    assert any(n.kind == "CallSite" and n.name == "obj.start" and n.metadata["resolution"] == "unresolved" for n in result.nodes)


def test_redefinitions_do_not_merge_versions():
    graph = flow(analyze("def f():\n x=2\n x=x+3\n return x"), "f")
    assigns = sorted([o for o in graph.operations if "x" in o.writes], key=lambda o: o.source.start_line)
    returned = next(o for o in graph.operations if o.kind == "return")
    assert assigns[0].definitions != assigns[1].definitions
    assert any(e.source == assigns[0].id and e.target == assigns[1].id and e.kind == "data" for e in graph.edges)
    assert {e.source for e in graph.edges if e.target == returned.id and e.kind == "data"} == {assigns[1].id}


def test_branches_merge_both_definitions():
    graph = flow(analyze("def f(flag):\n if flag:\n  x=1\n else:\n  x=2\n return x"), "f")
    condition = next(o for o in graph.operations if o.kind == "condition")
    assert {e.label for e in graph.edges if e.source == condition.id and e.kind == "control"} == {"True", "False"}
    returned = next(o for o in graph.operations if o.kind == "return")
    assert len([e for e in graph.edges if e.target == returned.id and e.kind == "data"]) == 2


def test_loop_carried_dependency_and_cycle():
    graph = flow(analyze("def f(values):\n total=0\n for value in values:\n  total+=value\n return total"), "f")
    loop = next(o for o in graph.operations if o.kind == "loop")
    update = next(o for o in graph.operations if o.expression == "total += value")
    assert any(e.source == update.id and e.target == loop.id and e.kind == "control" for e in graph.edges)
    assert any(e.source == update.id and e.target == update.id and e.kind == "data" for e in graph.edges)
    assert {e.label for e in graph.edges if e.source == loop.id and e.kind == "control"} == {"Body (symbolic)", "Exit"}


def test_return_is_terminal_and_unreachable_removed():
    graph = flow(analyze("def f():\n return 1\n x=9"), "f")
    assert not any(o.expression == "x = 9" for o in graph.operations)


def test_recursive_async_and_generator():
    result = analyze("async def f(x):\n return await f(x)\ndef g():\n yield 1")
    node = symbol(result, "f", "Function")
    assert node.metadata["async"]
    assert symbol(result, "g", "Function").metadata["generator"]
    assert any(e.source == node.id and e.target == node.id and e.kind == "CALLS" for e in result.edges)


def test_parse_failure_is_partial():
    result = analyze("def broken(", {"valid.py": "def fine(): return 1"})
    assert symbol(result, "fine")
    assert any(d.code == "parse_error" for d in result.diagnostics)


def test_exceptions_are_opaque_not_fabricated():
    graph = flow(analyze("def f():\n try:\n  x=1\n except Exception:\n  x=2\n return x"), "f")
    assert graph.limitations and any(o.kind == "unknown" for o in graph.operations)


def test_stable_schema_and_no_dangling_edges():
    first = analyze("def f(x): return x+1")
    second = analyze("def f(x): return x+1")
    assert first.model_dump(exclude={"metrics"}) == second.model_dump(exclude={"metrics"})
    restored = Analysis.model_validate_json(first.model_dump_json())
    ids = {n.id for n in restored.nodes}
    assert len(ids) == len(restored.nodes)
    assert all(e.source in ids and e.target in ids for e in restored.edges)


def test_flow_limit_diagnostic():
    result = AnalysisEngine(Limits(max_flow_nodes=3)).analyze({"m.py": "def f():\n a=1\n b=2\n c=3\n return c"})
    assert any(d.code == "flow_limit" for d in result.diagnostics)


@pytest.mark.parametrize("path", ["../bad.py", "/etc/passwd", "C:/bad.py", "a\\b.py", "a/../../b", "a/./b"])
def test_path_rejection(path):
    with pytest.raises(ValueError):
        safe_path(path)


def test_gitignore_and_size_limits():
    assert RepositoryLoader().load({".gitignore": "ignored.py\n", "ignored.py": "pass", "ok.py": "pass", "node_modules/a.py": "pass"}) == {"ok.py": "pass"}
    with pytest.raises(ValueError):
        RepositoryLoader(Limits(max_file_bytes=2)).load({"x.py": "pass"})


def zip_bytes(path, content=b"pass", symlink=False):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        info = zipfile.ZipInfo(path)
        if symlink:
            info.external_attr = (stat.S_IFLNK | 0o777) << 16
        archive.writestr(info, content)
    return buffer.getvalue()


@pytest.mark.parametrize("path,symlink", [("repo/../../bad.py", False), ("repo/link.py", True)])
def test_hostile_archives(path, symlink):
    with pytest.raises(ValueError):
        RepositoryLoader().archive(zip_bytes(path, symlink=symlink))


def test_archive_load_and_expansion_limit():
    assert RepositoryLoader().archive(zip_bytes("repo/main.py")) == {"main.py": "pass"}
    with pytest.raises(ValueError):
        RepositoryLoader(Limits(max_archive_bytes=3)).archive(zip_bytes("repo/main.py"))


@pytest.mark.parametrize("url", ["http://github.com/a/b", "https://evil.test/a/b", "https://github.com@evil.test/a/b", "https://github.com/a/b?url=x", "https://github.com/a/../"])
def test_ssrf_rejected_before_network(url):
    with pytest.raises(ValueError):
        RepositoryLoader().github(url)


def test_api_snapshot_boundaries():
    result = analyze("def f(): return 1")
    store.repositories[result.repository.id] = result
    client = TestClient(app)
    root = f"/api/repositories/{result.repository.id}"
    assert client.get("/api/health").status_code == 200
    assert client.get(root + "/graph").json()["nodes"]
    assert client.get(root + "/source", params={"path": "../../secrets"}).status_code == 404
    assert client.get(root + "/source", params={"path": "main.py"}).json()["source"] == "def f(): return 1"
    assert client.post("/api/repositories/import", json={"path": "C:/"}).status_code == 422
    assert client.post("/api/repositories/import", json={"files": {"../bad.py": "pass"}}).status_code == 422
    assert client.get("/api/health", headers={"Origin": "https://evil.test"}).status_code == 403
    assert client.get("/api/health", headers={"Host": "evil.test"}).status_code == 400
    assert json.loads(client.get(root + "/export").text)["schema_version"] == "1.0"


def test_examples_consistent():
    examples = Path(__file__).resolve().parents[2] / "examples"
    for root in examples.iterdir():
        files = {p.relative_to(root).as_posix(): p.read_text() for p in root.rglob("*.py")}
        result = AnalysisEngine().analyze(files, root.name)
        ids = {n.id for n in result.nodes}
        assert not any(d.severity == "error" for d in result.diagnostics)
        assert all(e.source in ids and e.target in ids for e in result.edges)
        assert result.flows


def test_import_usage_inside_function_and_conditional_import():
    result = analyze("if flag:\n from helper import target\ndef f():\n return target()", {"helper.py": "def target(): return 1"})
    imports = [e for e in result.edges if e.kind == "IMPORTS"]
    assert imports[0].label.endswith("used")
    assert imports[0].resolution == "candidate"
    assert all(n.metadata["resolution"] == "candidate" for n in result.nodes if n.kind == "CallSite" and n.name == "target")


def test_loop_binding_shadows_global_function():
    result = analyze("def target(): return 1\ndef f(items):\n for target in items:\n  target()")
    assert all(n.metadata["resolution"] == "unresolved" for n in result.nodes if n.kind == "CallSite")


def test_alias_assignment_is_candidate_and_unbound_method_keeps_self():
    result = analyze("class C:\n def m(self, x): return x\ndef f(obj):\n alias=C.m\n alias(obj, 1)\n return C.m(obj, 2)")
    alias = next(n for n in result.nodes if n.kind == "CallSite" and n.name == "alias")
    assert alias.metadata["resolution"] == "candidate"
    direct = next(n for n in result.nodes if n.kind == "CallSite" and n.name == "C.m")
    bindings = [e for e in result.edges if e.source == direct.id and e.kind == "PASSES_ARGUMENT"]
    assert {e.label for e in bindings} == {"obj", "2"}


def test_explicit_read_write_and_return_relations():
    result = analyze("def f(x):\n y=x+1\n return y")
    assert {e.kind for e in result.edges} >= {"READS", "WRITES", "RETURNS", "DEPENDS_ON"}


def test_duplicate_archive_paths_rejected():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("repo/main.py", "pass")
        with pytest.warns(UserWarning):
            archive.writestr("repo/main.py", "print('second')")
    with pytest.raises(ValueError, match="Duplicate"):
        RepositoryLoader().archive(buffer.getvalue())

def test_source_is_never_executed():
    import uuid
    marker = Path(__file__).with_name(f'not-created-{uuid.uuid4().hex}.txt')
    result = analyze(f"from pathlib import Path\nPath({str(marker)!r}).write_text('executed')\nraise RuntimeError('must not execute')")
    assert result.nodes
    assert not marker.exists()


def test_synthetic_entry_exit_never_repeat_calls():
    result = analyze('def helper(): return 1\ndef f():\n return helper()')
    graph = flow(result, 'f')
    assert all(not op.calls for op in graph.operations if op.kind in {'input', 'exit', 'join'})
    assert len(next(op for op in graph.operations if op.kind == 'return').calls) == 1


def test_default_expression_is_not_a_body_call():
    result = analyze('def helper(): return 1\ndef f(value=helper()):\n return value')
    function = symbol(result, 'f', 'Function')
    assert not any(e.kind == 'CALLS' and e.source == function.id for e in result.edges)
