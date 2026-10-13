"""Analysis orchestration: parse → resolve → relations → control/data flow."""
import ast
import time
from app.analysis.ast_parser import ASTParser, expr, local_walk, location, stable_id
from app.analysis.class_analyzer import ClassAnalyzer
from app.analysis.data_flow import DataFlowAnalyzer
from app.analysis.import_resolver import ImportResolver
from app.analysis.repository_loader import Limits, RepositoryLoader, snapshot
from app.models.schema import Analysis, Diagnostic, FileRecord, GraphEdge, GraphNode, Repository, Resolution, Reference


class AnalysisEngine:
    def __init__(self, limits: Limits | None = None):
        self.limits = limits or Limits()

    def analyze(self, files: dict[str, str], name="repository", revision=None) -> Analysis:
        started = time.perf_counter()
        loader = RepositoryLoader(self.limits)
        files = loader.load(files)
        discovered = time.perf_counter()
        digest = snapshot(files)
        parsed = ASTParser().parse(files)
        parsed_at = time.perf_counter()
        resolver = ImportResolver(parsed)
        resolver.resolve_imports()
        for scope, tree in parsed.definitions.items():
            if isinstance(tree, ast.ClassDef):
                resolver.bases[scope] = [t for base in tree.bases for t in resolver.resolve(base, scope) if resolver.nodes[t].kind == "Class"]
        ClassAnalyzer(resolver).analyze()
        resolved_at = time.perf_counter()
        result = Analysis(repository=Repository(id=digest[:24], name=name[:120], revision=revision, snapshot=digest),
            files=[FileRecord(path=path, package=resolver.nodes[stable_id(path, "module")].qualified_name,
                source=source, parsed=path in parsed.trees) for path, source in files.items()],
            nodes=parsed.nodes, diagnostics=parsed.diagnostics)
        edges: dict[str, GraphEdge] = {}

        def edge(source, target, kind, node=None, file=None, status="resolved", label=""):
            provenance = location(file, node) if node is not None and file else None
            identifier = stable_id(source, target, kind, str(provenance), label)
            edges[identifier] = GraphEdge(id=identifier, source=source, target=target, kind=kind,
                resolution=Resolution(status), provenance=provenance, label=label)

        root = GraphNode(id=stable_id(digest, "repository"), kind="Repository", name=name[:120], qualified_name=name[:120])
        result.nodes.append(root)
        for node in list(result.nodes):
            if node.parent:
                edge(node.parent, node.id, "CONTAINS")
            elif node.kind == "Module":
                edge(root.id, node.id, "CONTAINS")
        import_usages: dict[tuple[str, str], set[str]] = {}
        for use_scope, use_tree in parsed.definitions.items():
            source = resolver.nodes[use_scope].source
            if source is None:
                continue
            names = {n.id for n in local_walk(use_tree) if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load)}
            for used_name in names:
                import_usages.setdefault((source.file, used_name), set()).update(resolver.lookup(used_name, use_scope))
        for record in resolver.import_records:
            used = bool(import_usages.get((record["file"], record["local"]), set()) & set(record["targets"]))
            for target in record["targets"]:
                status = resolver.status(record["targets"])
                edge(record["scope"], target, "IMPORTS", record["node"], record["file"],
                    "candidate" if record["conditional"] and status == "resolved" else status,
                    f"{record['local']} · {'used' if used else 'declared'}")
        for scope, tree in parsed.definitions.items():
            symbol = resolver.nodes[scope]
            assert symbol.source is not None
            file = symbol.source.file
            if isinstance(tree, ast.ClassDef):
                for base in tree.bases:
                    targets = resolver.resolve(base, scope)
                    if not targets:
                        targets = [resolver.external(expr(base), file, base, True)]
                    for target in targets:
                        edge(scope, target, "INHERITS", base, file, resolver.status(targets))
            calls = {}
            for node in local_walk(tree):
                if not isinstance(node, ast.Call):
                    continue
                call_id = stable_id(scope, "call", node.lineno, node.col_offset)
                targets = resolver.resolve(node.func, scope)
                targets = [t for t in targets if resolver.nodes[t].kind in {"Class", "Function", "Method", "ExternalDependency"}]
                if not targets:
                    targets = [resolver.external(expr(node.func), file, node, True)]
                status = resolver.status(targets, node.func, scope)
                call = GraphNode(id=call_id, kind="CallSite", name=expr(node.func), qualified_name=symbol.qualified_name + f".@{node.lineno}:{node.col_offset}",
                    source=location(file, node), parent=scope, metadata={"expression": expr(node), "targets": targets,
                        "resolution": status, "arguments": [expr(a) for a in node.args],
                        "keywords": {k.arg or "**": expr(k.value) for k in node.keywords}})
                result.nodes.append(call)
                edge(scope, call_id, "CONTAINS", node, file)
                calls[(node.lineno, node.col_offset)] = [call_id]
                for target in targets:
                    is_class = resolver.nodes[target].kind == "Class"
                    edge(call_id, target, "INSTANTIATES" if is_class else "CALLS", node, file, status)
                    edge(scope, target, "INSTANTIATES" if is_class else "CALLS", node, file, status, "summary")
                    enclosing_class = resolver.enclosing_class(scope)
                    if is_class and enclosing_class:
                        edge(enclosing_class, target, "INSTANTIATES", node, file, status, f"observed in {symbol.name}")
                    parameters = resolver.nodes[target].metadata.get("parameters", [])
                    if resolver.nodes[target].kind == "Method" and isinstance(node.func, ast.Attribute):
                        decorators = resolver.nodes[target].metadata.get("decorators", [])
                        receiver = expr(node.func.value)
                        bound = receiver in {"self", "cls"} or (scope, receiver) in resolver.types or (resolver.enclosing_class(scope), receiver) in resolver.types
                        if "classmethod" in decorators or (bound and "staticmethod" not in decorators):
                            parameters = parameters[1:]
                    for arg, parameter in zip(node.args, parameters):
                        edge(call_id, parameter, "PASSES_ARGUMENT", arg, file, "candidate" if any(isinstance(a, ast.Starred) for a in node.args) else status, expr(arg))
                    for keyword in node.keywords:
                        for parameter in parameters:
                            if resolver.nodes[parameter].name == keyword.arg:
                                edge(call_id, parameter, "PASSES_ARGUMENT", keyword.value, file, status, expr(keyword.value))
            if isinstance(tree, (ast.FunctionDef, ast.AsyncFunctionDef)):
                analyzer = DataFlowAnalyzer(scope, file, self.limits.max_flow_nodes)
                analyzer.calls = calls
                try:
                    flow = analyzer.build(tree)
                    result.flows[scope] = flow
                    for operation in flow.operations:
                        result.nodes.append(GraphNode(id=operation.id, kind="Operation", name=operation.expression[:100],
                            qualified_name=symbol.qualified_name + "." + operation.id, source=operation.source,
                            parent=scope, metadata={"operation_kind": operation.kind}))
                    for operation in flow.operations:
                        for access_kind, access_names in (("READS", operation.reads), ("WRITES", operation.writes)):
                            for accessed_name in access_names:
                                variable_id = stable_id(scope, "variable", accessed_name)
                                targets = [variable_id] if variable_id in resolver.nodes else []
                                if not targets:
                                    try:
                                        targets = resolver.resolve(ast.parse(accessed_name, mode="eval").body, scope)
                                    except SyntaxError:
                                        targets = []
                                if not targets and accessed_name.startswith(("self.", "cls.")):
                                    owner = resolver.enclosing_class(scope)
                                    attribute_id = stable_id(owner, "attribute", accessed_name.split(".", 1)[1])
                                    targets = [attribute_id] if attribute_id in resolver.nodes else []
                                for accessed_target in targets:
                                    provenance_node = ast.Constant(value=None)
                                    provenance_node.lineno = operation.source.start_line
                                    provenance_node.end_lineno = operation.source.end_line
                                    edge(operation.id, accessed_target, access_kind, provenance_node, file,
                                         label=operation.definitions.get(accessed_name, accessed_name))
                                    if resolver.nodes[accessed_target].kind == "Attribute":
                                        edge(operation.id, accessed_target, "ACCESSES_ATTRIBUTE", provenance_node, file)
                        if operation.kind == "return":
                            edge(operation.id, scope, "RETURNS", label=operation.expression)
                    operation_locations = {op.id: op.source for op in flow.operations}
                    for link in flow.edges:
                        edge(link.source, link.target, "DEPENDS_ON" if link.kind == "data" else "FLOWS_TO", label=link.label)
                        identifier = stable_id(link.source, link.target, "DEPENDS_ON" if link.kind == "data" else "FLOWS_TO", str(None), link.label)
                        edges[identifier].provenance = operation_locations[link.source]
                    for limitation in flow.limitations:
                        result.diagnostics.append(Diagnostic(code="partial_flow", message=limitation, source=symbol.source))
                except (ValueError, RecursionError) as error:
                    result.diagnostics.append(Diagnostic(code="flow_limit", message=str(error), source=symbol.source))
            if len(result.nodes) > self.limits.max_nodes or time.perf_counter() - started > self.limits.timeout:
                raise ValueError("Analysis node/time limit exceeded")
        # Token-level source evidence, kept in lexical scopes. AST columns are UTF-8
        # byte offsets; the editor protocol uses UTF-16 code units.
        for scope, tree in parsed.definitions.items():
            scope_source = resolver.nodes[scope].source
            if scope_source is None:
                continue
            file = scope_source.file
            lines = files[file].splitlines()
            call_tokens = {id(n.func) for n in local_walk(tree) if isinstance(n, ast.Call)}
            for ref in local_walk(tree):
                if not isinstance(ref, (ast.Name, ast.Attribute)):
                    continue
                span = location(file, ref)
                if isinstance(ref, ast.Attribute):
                    span.start_line = span.end_line
                    span.start_column = span.end_column - len(ref.attr.encode("utf-8"))
                for line_key, column_key in (("start_line", "start_column"), ("end_line", "end_column")):
                    line = lines[getattr(span, line_key) - 1]
                    prefix = line.encode("utf-8")[:getattr(span, column_key)].decode("utf-8", errors="ignore")
                    setattr(span, column_key, len(prefix.encode("utf-16-le")) // 2)
                targets = resolver.resolve(ref, scope)
                # Token navigation points to the lexical storage declaration, not
                # a flow-insensitive callable alias inferred for call resolution.
                storage_id = stable_id(scope, "variable", ref.id) if isinstance(ref, ast.Name) else None
                if isinstance(ref, ast.Attribute) and expr(ref.value) in {"self", "cls"}:
                    storage_id = stable_id(resolver.enclosing_class(scope), "attribute", ref.attr)
                if storage_id in resolver.nodes:
                    targets = list(dict.fromkeys([storage_id, *targets])) if id(ref) in call_tokens else [storage_id]
                status = ("candidate" if len(targets) > 1 else "resolved" if storage_id in resolver.nodes else resolver.status(targets, ref, scope)) if targets else "unresolved"
                result.references.append(Reference(scope=scope, name=expr(ref), source=span,
                    targets=targets, resolution=Resolution(status),
                    access="write" if isinstance(ref.ctx, ast.Store) else "read"))
            if len(result.references) > self.limits.max_nodes * 4 or time.perf_counter() - started > self.limits.timeout:
                raise ValueError("Reference index node/time limit exceeded")
        # Externals may have been created lazily during call resolution.
        known = {n.id for n in result.nodes}
        result.nodes.extend(n for n in parsed.nodes if n.id not in known)
        result.nodes.sort(key=lambda n: n.id)
        result.edges = sorted(edges.values(), key=lambda e: e.id)
        result.diagnostics.append(Diagnostic(code="static_analysis", severity="info",
            message="Static analysis only. Annotations and receiver inference are evidence, not runtime guarantees. Dynamic dispatch, alias mutation, reflection and implicit exception paths may remain unknown."))
        if loader.ignored:
            result.diagnostics.append(Diagnostic(code="ignored_files", severity="info", message=f"Ignored {len(loader.ignored)} non-Python/excluded files."))
        finished = time.perf_counter()
        result.metrics = {"discovery_ms": (discovered-started)*1000, "parsing_ms": (parsed_at-discovered)*1000,
            "resolution_ms": (resolved_at-parsed_at)*1000, "graphs_ms": (finished-resolved_at)*1000,
            "total_ms": (finished-started)*1000, "nodes": len(result.nodes), "edges": len(result.edges)}
        return result



