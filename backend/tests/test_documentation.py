import io
import zipfile
from app.analysis.engine import AnalysisEngine
from app.analysis.repository_loader import RepositoryLoader, snapshot
from app.services.documentation import documentation
from app.services.queries import QueryIndex


def project(readme):
    return AnalysisEngine().analyze({"README.md": readme, "docs/guide.md": "# Guide\nSee [entry](../main.py#L2)", "main.py": "def entry():\n return 1", "other.py": "def entry(): return 2"})


def refs(result):
    return [r for d in result["documents"] for s in d["sections"] for r in s["references"]]


def test_markdown_is_snapshotted_but_never_parsed_as_python():
    analysis = project("# Project\n<script>alert('no')</script>")
    assert not any(d.code == "parse_error" for d in analysis.diagnostics)
    assert not any(n.source and n.source.file.endswith(".md") for n in analysis.nodes)
    assert analysis.repository.snapshot == snapshot({f.path: f.source for f in analysis.files})
    assert any(f.path == "README.md" for f in analysis.files)


def test_markdown_archive_utf8_and_ignore_rules():
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        archive.writestr("repo/main.py", "x=1")
        archive.writestr("repo/README.md", "# Démarrage")
        archive.writestr("repo/.gitignore", "private.md")
        archive.writestr("repo/private.md", "hidden")
    files = RepositoryLoader().archive(stream.getvalue())
    assert files["README.md"] == "# Démarrage" and "private.md" not in files


def test_links_anchors_line_ranges_ambiguity_and_commands():
    result = documentation(project("# Start\n[code](main.py#L2) and [docs](docs/guide.md#guide)\n`entry` then `main.entry`\n```sh\npython main.py\n```\n# Start\n[again](#start-1)"))
    references = refs(result)
    assert next(r for r in references if r["label"] == "code")["line"] == 2
    assert next(r for r in references if r["label"] == "docs")["status"] == "file"
    assert len(next(r for r in references if r["label"] == "entry")["targets"]) == 2
    assert len(next(r for r in references if r["label"] == "main.entry")["targets"]) == 1
    assert next(r for r in references if r["label"] == "python main.py")["path"] == "main.py"
    assert next(r for r in references if r["label"] == "again")["status"] == "file"
    assert next(r for r in references if r["label"] == "entry" and r["path"])["path"] == "main.py"


def test_unsafe_missing_and_malformed_links_are_visible():
    result = documentation(project("# Links\n[x](javascript:alert) [out](../../secret.py) [broken](gone.py) [anchor](#nope) [bad](http://[invalid) [line](main.py#L99)"))
    statuses = {r["label"]: r["status"] for r in refs(result)}
    assert statuses["x"] == statuses["out"] == statuses["bad"] == "blocked"
    assert statuses["broken"] == statuses["anchor"] == statuses["line"] == "missing"


def test_index_has_explicit_budget():
    result = documentation(project("# Huge\n" + "\n".join(f"[link{i}](main.py)\n# Section{i}" for i in range(700))))
    assert result["truncated"] and len(refs(result)) <= 500


def test_architecture_hierarchy_excludes_markdown_without_missing_module_ids():
    result = QueryIndex(project("# Project")).hierarchy()
    assert {n.qualified_name for n in result["nodes"]} == {"main.py", "other.py"}


def test_requested_document_is_indexed_even_beyond_default_budget():
    files = {"main.py": "x=1", **{f"doc{i:02d}.md": "# Doc\n" + "a" * 49_990 for i in range(6)}}
    analysis = AnalysisEngine().analyze(files)
    normal = documentation(analysis)
    assert "doc05.md" in normal["available"]
    assert "doc05.md" not in [d["path"] for d in normal["documents"]]
    focused = documentation(analysis, "doc05.md")
    assert focused["documents"][0]["path"] == "doc05.md"


def test_documentation_drift_distinguishes_invalid_removed_and_moved_targets():
    from app.services.documentation import compare_documentation_versions
    before = AnalysisEngine().analyze({"README.md": "# Start\n[old](old.py) `entry` [deleted](old.py)", "old.py": "def entry(): return 1"})
    after = AnalysisEngine().analyze({"README.md": "# Start\n[old](old.py) `entry`", "new.py": "def entry(): return 1"})
    result = compare_documentation_versions(after, before)
    assert {(c["label"], c["status"]) for c in result["changes"]} == {("old", "invalid"), ("entry", "changed"), ("deleted", "removed")}
    assert not result["truncated"]
    assert compare_documentation_versions(before, before)["changes"] == []
