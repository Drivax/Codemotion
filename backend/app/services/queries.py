"""Bounded, source-grounded queries over a snapshot. No imported code is executed."""
import io
import tokenize
from collections import Counter, defaultdict, deque
from pathlib import PurePosixPath
from typing import Any
from app.analysis.ast_parser import stable_id
from app.models.schema import Analysis, GraphEdge, GraphNode, Reference, Resolution, SourceLocation

STRUCTURE = {"Class", "Function", "Method", "Module", "ExternalDependency", "Unknown"}
DEPENDENCIES = {"CALLS", "INSTANTIATES", "IMPORTS", "INHERITS"}
LIMITATION = "Relations statiques identifiées seulement ; absence de résultat ne signifie pas absence de dépendance runtime."


class QueryIndex:
    def __init__(self, analysis: Analysis):
        self.analysis = analysis
        self.nodes = {n.id: n for n in analysis.nodes}
        self.files = {f.path: f for f in analysis.files}
        self.children: dict[str, list] = defaultdict(list)
        self.outgoing: dict[str, list] = defaultdict(list)
        self.incoming: dict[str, list] = defaultdict(list)
        self.references: dict[str, list] = defaultdict(list)
        self.by_target: dict[str, list] = defaultdict(list)
        for n in analysis.nodes:
            if n.parent:
                self.children[n.parent].append(n)
        self.structural = [e for e in analysis.edges if e.kind in DEPENDENCIES | {"CONTAINS"}
                           and self.nodes[e.source].kind in STRUCTURE and self.nodes[e.target].kind in STRUCTURE]
        for e in self.structural:
            self.outgoing[e.source].append(e)
            self.incoming[e.target].append(e)
        declarations = []
        by_file = defaultdict(list)
        for node in analysis.nodes:
            if node.source and node.kind in {"Class", "Function", "Method", "Parameter"}:
                by_file[node.source.file].append(node)
        for file, nodes in by_file.items():
            source = self.files[file].source or ""
            lines = source.splitlines()
            tokens = []
            try:
                tokens = list(tokenize.generate_tokens(io.StringIO(source).readline))
            except (tokenize.TokenError, IndentationError, SyntaxError):
                continue
            names = defaultdict(list)
            previous = ""
            for token in tokens:
                if token.type == tokenize.NAME:
                    names[(token.start[0], token.string)].append((token, previous))
                if token.type not in {tokenize.COMMENT, tokenize.NL, tokenize.INDENT, tokenize.DEDENT}:
                    previous = token.string
            for node in nodes:
                span = node.source
                if span is None:
                    continue
                for token, before in names[(span.start_line, node.name)]:
                    line = lines[token.start[0] - 1]
                    byte_column = len(line[:token.start[1]].encode("utf-8"))
                    if node.kind == "Parameter":
                        if byte_column != span.start_column:
                            continue
                    elif before not in {"def", "class"}:
                        continue
                    start = len(line[:token.start[1]].encode("utf-16-le")) // 2
                    end = len(line[:token.end[1]].encode("utf-16-le")) // 2
                    declarations.append(Reference(scope=node.parent or node.id, name=node.name,
                        source=SourceLocation(file=file, start_line=token.start[0], end_line=token.end[0], start_column=start, end_column=end),
                        targets=[node.id], resolution=Resolution.resolved, access="declaration"))
                    break
        for ref in [*analysis.references, *declarations]:
            self.references[ref.source.file].append(ref)
            for target in ref.targets:
                self.by_target[target].append(ref)

    def neighborhood(self, focus=None, direction="both", depth=1, kinds=None, limit=100, offset=0, edge_limit=1000, pin=None):
        kinds = set(kinds or DEPENDENCIES | {"CONTAINS"})
        distances = {}
        if focus:
            if focus not in self.nodes:
                raise ValueError("Symbol not found")
            distances[focus] = 0
            todo = deque([focus])
            while todo:
                current = todo.popleft()
                if distances[current] >= depth:
                    continue
                edges = ([] if direction == "out" else self.incoming[current]) + ([] if direction == "in" else self.outgoing[current])
                for e in edges:
                    other = e.target if e.source == current else e.source
                    if e.kind in kinds and other not in distances:
                        distances[other] = distances[current] + 1
                        todo.append(other)
            candidates = [self.nodes[i] for i in distances]
        else:
            candidates = [n for n in self.nodes.values() if n.kind in STRUCTURE]
        candidates.sort(key=lambda n: (n.id != (focus or pin), distances.get(n.id, 0), n.qualified_name, n.id))
        # Keep the focus visible on later pages, so graph expansion cannot lose it.
        nodes = candidates[offset:offset + limit]
        if focus and offset and all(n.id != focus for n in nodes):
            nodes = [self.nodes[focus], *nodes]
        ids = {n.id for n in nodes}
        edges = [e for e in self.structural if e.kind in kinds and e.source in ids and e.target in ids]
        return {"nodes": nodes, "edges": edges[:edge_limit], "total": len(candidates), "edge_total": len(edges),
                "next_offset": offset + limit if offset + limit < len(candidates) else None,
                "truncated": offset + limit < len(candidates) or len(edges) > edge_limit,
                "scope": {"focus": focus, "direction": direction, "depth": depth, "relations": sorted(kinds)},
                "limits": {"nodes": limit, "edges": edge_limit}, "limitation": LIMITATION}

    def hierarchy(self, prefix="", limit=100, offset=0):
        prefix = prefix.strip("/")
        base = prefix + "/" if prefix else ""
        groups: dict[str, GraphNode] = {}
        file_group = {}
        for file in sorted(self.files):
            if not file.endswith(".py") or not file.startswith(base):
                continue
            remainder = file[len(base):]
            part = remainder.split("/")[0]
            path = base + part
            directory = "/" in remainder
            key = stable_id("directory", path) if directory else stable_id(file, "module")
            groups[key] = GraphNode(id=key, kind="Directory" if directory else "Module", name=part,
                qualified_name=path, source=None if directory else self.nodes[key].source,
                metadata={"path": path, "directory": directory})
            file_group[file] = key
        counts: dict[tuple, list] = defaultdict(list)
        for e in self.structural:
            if e.kind == "CONTAINS":
                continue
            a, b = self.nodes[e.source], self.nodes[e.target]
            source = file_group.get(a.source.file) if a.source else None
            target = file_group.get(b.source.file) if b.source else None
            if source and target and source != target and a.kind not in {"Unknown", "ExternalDependency"} and b.kind not in {"Unknown", "ExternalDependency"}:
                counts[(source, target)].append(e)
        selected = list(groups.values())[offset:offset + limit]
        ids = {n.id for n in selected}
        edges = [GraphEdge(id=stable_id(*key, "grouped"), source=key[0], target=key[1], kind="GROUPED",
                           resolution=Resolution.candidate if any(e.resolution != "resolved" for e in values) else Resolution.resolved,
                           label=f"{len(values)} liens · " + ", ".join(f"{k.lower()}: {v}" for k, v in Counter(e.kind for e in values).items()),
                           provenance=values[0].provenance)
                 for key, values in counts.items() if key[0] in ids and key[1] in ids]
        return {"nodes": selected, "edges": edges[:1000], "total": len(groups), "edge_total": len(edges),
                "truncated": offset + limit < len(groups) or len(edges) > 1000,
                "next_offset": offset + limit if offset + limit < len(groups) else None,
                "scope": {"prefix": prefix, "level": "directories/files"}, "limitation": LIMITATION}

    def group_relations(self, source, target, limit=200):
        def matches(node, path):
            return node.kind not in {"ExternalDependency", "Unknown"} and node.source and (node.source.file == path or node.source.file.startswith(path.rstrip("/") + "/"))
        edges = [e for e in self.structural if e.kind in DEPENDENCIES and matches(self.nodes[e.source], source) and matches(self.nodes[e.target], target)]
        return {"items": [{"symbol": self.nodes[e.source], "path": [e]} for e in edges[:limit]],
                "truncated": len(edges) > limit, "total": len(edges), "limitation": LIMITATION}

    def search(self, query, mode="symbols", offset=0, limit=50):
        q = query.casefold().strip()
        if not q:
            return {"items": [], "total": 0, "next_offset": None}
        hits: list[dict[str, Any]] = []
        if mode == "text":
            for file in self.analysis.files:
                for line, content in enumerate(file.source.splitlines(), 1):
                    if q in content.casefold():
                        hits.append({"name": content.strip()[:400], "kind": "Text", "source": {"file": file.path, "start_line": line, "end_line": line, "start_column": 0, "end_column": 0}})
        else:
            for n in self.nodes.values():
                if n.kind in STRUCTURE and q in (n.qualified_name + " " + (n.source.file if n.source else "")).casefold():
                    hits.append(n.model_dump(mode="json"))
            hits.sort(key=lambda n: (0 if n["name"].casefold() == q else 1 if n["name"].casefold().startswith(q) else 2, n["qualified_name"]))
        return {"items": hits[offset:offset + limit], "total": len(hits), "next_offset": offset + limit if offset + limit < len(hits) else None}

    def variable(self, function_id, name):
        flow = self.analysis.flows.get(function_id)
        if not flow:
            raise ValueError("Function flow unavailable")
        ops = [o for o in flow.operations if name in o.reads or name in o.writes]
        ids = {o.id for o in ops}
        calls = {i for o in ops for i in o.calls}
        def contains_name(edge):
            if edge.provenance is None:
                return False
            # Compare UTF-16 token columns with converted AST argument columns.
            span = edge.provenance
            lines = self.files[span.file].source.splitlines()
            start = len(lines[span.start_line - 1].encode("utf-8")[:span.start_column].decode("utf-8", errors="ignore").encode("utf-16-le")) // 2
            end = len(lines[span.end_line - 1].encode("utf-8")[:span.end_column].decode("utf-8", errors="ignore").encode("utf-16-le")) // 2
            return any(ref.name == name and ref.scope == function_id and
                       (span.start_line, start) <= (ref.source.start_line, ref.source.start_column) and
                       (ref.source.end_line, ref.source.end_column) <= (span.end_line, end)
                       for ref in self.references[span.file])
        bindings = [e for e in self.analysis.edges if e.kind == "PASSES_ARGUMENT" and e.source in calls and contains_name(e)]
        return {"function_id": function_id, "name": name, "operations": ops,
                "definitions": [o for o in ops if name in o.writes],
                "uses": [o for o in ops if name in o.reads],
                "edges": [e for e in flow.edges if e.kind == "data" and e.label == name and e.source in ids and e.target in ids],
                "bindings": [{"relation": e, "parameter": self.nodes[e.target], "function": self.nodes.get(self.nodes[e.target].parent or "")} for e in bindings],
                "limitations": [*flow.limitations, "Portée lexicale de la fonction ; alias et mutations indirectes incomplets. Valeurs runtime indisponibles."]}

    def semantic(self, file, line, column):
        if file not in self.files:
            raise ValueError("File not in snapshot")
        refs = [r for r in self.references[file] if r.source.start_line == line and r.source.start_column <= column < r.source.end_column]
        refs.sort(key=lambda r: r.source.end_column - r.source.start_column)
        selected = refs[:1]
        targets = sorted({i for r in selected for i in r.targets})
        return {"references": selected, "targets": [self.nodes[i] for i in targets if i in self.nodes],
                "usages": [r for i in targets for r in self.by_target[i]][:200],
                "usage_total": sum(len(self.by_target[i]) for i in targets), "limitation": LIMITATION}

    def impact(self, symbol, depth=4, limit=200):
        if symbol not in self.nodes:
            raise ValueError("Symbol not found")
        paths: dict[str, list] = {symbol: []}
        todo = deque([symbol])
        truncated = False
        while todo:
            node = todo.popleft()
            incoming = [e for e in self.incoming[node] if e.kind in DEPENDENCIES]
            if len(paths[node]) >= depth:
                truncated |= any(e.source not in paths for e in incoming)
                continue
            for e in incoming:
                if e.source not in paths:
                    if len(paths) >= limit + 1:
                        truncated = True
                        continue
                    paths[e.source] = [e, *paths[node]]
                    todo.append(e.source)
        items = [{"symbol": self.nodes[i], "distance": len(path), "path": path,
                  "test": bool(self.nodes[i].source and any(p.startswith("test") for p in PurePosixPath(getattr(self.nodes[i].source, "file", "")).parts))}
                 for i, path in paths.items() if i != symbol]
        return {"items": items, "truncated": truncated, "depth": depth, "limit": limit, "limitation": LIMITATION}

    def paths(self, start, target, depth=6, limit=20, kinds=None):
        if start not in self.nodes or target not in self.nodes:
            raise ValueError("Symbol not found")
        kinds = set(kinds or DEPENDENCIES)
        queue: deque[tuple[str, list[GraphEdge], set[str]]] = deque([(start, [], {start})])
        found: list[list[GraphEdge]] = []
        explored = 0
        truncated = False
        while queue and len(found) < limit and explored < 10000:
            current, path, seen = queue.popleft()
            explored += 1
            if current == target:
                found.append(path)
                continue
            if len(path) >= depth:
                truncated |= bool(self.outgoing[current])
                continue
            for edge in self.outgoing[current]:
                if edge.kind in kinds and edge.target not in seen:
                    queue.append((edge.target, [*path, edge], seen | {edge.target}))
                    if len(queue) >= 10000:
                        truncated = True
                        break
        return {"paths": found, "truncated": truncated or bool(queue), "explored": explored, "depth": depth, "limit": limit, "limitation": LIMITATION}

    def diagnostics(self, long_lines=80, members=20, connections=20):
        items = []
        for n in self.nodes.values():
            if n.kind not in {"Module", "Class", "Function", "Method"}:
                continue
            outgoing = [e for e in self.outgoing[n.id] if e.kind in DEPENDENCIES]
            incoming = [e for e in self.incoming[n.id] if e.kind in DEPENDENCIES]
            count = len({e.target for e in outgoing} | {e.source for e in incoming})
            lines = n.source.end_line - n.source.start_line + 1 if n.source else 0
            reasons = []
            if n.kind in {"Function", "Method"} and lines >= long_lines:
                reasons.append(("long_function", lines, "Lignes de la déclaration, commentaires compris", long_lines))
            if n.kind == "Class":
                size = sum(c.kind in {"Method", "Attribute"} for c in self.children[n.id])
                if size >= members:
                    reasons.append(("large_class", size, "Méthodes et attributs identifiés", members))
            if count >= connections:
                reasons.append(("connected_symbol", count, "Voisins distincts identifiés", connections))
            if n.kind == "Module" and not count:
                reasons.append(("unlinked_module", 0, "Aucune relation inter-symboles identifiée pour ce module", 0))
            if n.kind in {"Function", "Method"} and not any(e.kind == "CALLS" for e in incoming):
                reasons.append(("possibly_unused", 0, "Aucun appel identifié ; points d’entrée et dispatch dynamique possibles", 0))
            for code, value, definition, threshold in reasons:
                items.append({"code": code, "symbol": n, "value": value, "definition": definition, "threshold": threshold})
        # Module import SCCs, iterative DFS (safe for large repositories).
        modules = {n.id for n in self.nodes.values() if n.kind == "Module"}
        import_edges = []
        for e in self.structural:
            if e.kind != "IMPORTS":
                continue
            a, b = self.nodes[e.source], self.nodes[e.target]
            while a.parent and a.kind != "Module":
                a = self.nodes[a.parent]
            while b.parent and b.kind != "Module":
                b = self.nodes[b.parent]
            if a.id in modules and b.id in modules:
                import_edges.append((a.id, b.id, e))
        adj: dict[str, list] = defaultdict(list)
        rev: dict[str, list] = defaultdict(list)
        for source_id, target_id, _ in import_edges:
            adj[source_id].append(target_id)
            rev[target_id].append(source_id)
        seen = set()
        order = []
        for root in sorted(modules):
            stack = [(root, False)]
            while stack:
                node, done = stack.pop()
                if done:
                    order.append(node)
                elif node not in seen:
                    seen.add(node)
                    stack.append((node, True))
                    stack.extend((v, False) for v in adj[node] if v not in seen)
        seen.clear()
        cycles = []
        for root in reversed(order):
            if root in seen:
                continue
            group = set()
            stack2 = [root]
            while stack2:
                node = stack2.pop()
                if node not in seen:
                    seen.add(node)
                    group.add(node)
                    stack2.extend(rev[node])
            if len(group) > 1 or root in adj[root]:
                evidence = [e for a, b, e in import_edges if a in group and b in group]
                cycles.append({"modules": [self.nodes[i] for i in sorted(group)], "evidence": evidence,
                               "conditional_or_uncertain": any(e.resolution != "resolved" for e in evidence)})
        resolutions = Counter(n.metadata.get("resolution", "unresolved") for n in self.nodes.values() if n.kind == "CallSite")
        return {"items": items, "cycles": cycles, "call_resolution": dict(resolutions), "notes": self.analysis.diagnostics,
                "scope": self.analysis.repository, "limitation": LIMITATION + " Imports conditionnels : candidats ; TYPE_CHECKING non classifié séparément."}

    def compare(self, other):
        if self.analysis.engine_version != other.analysis.engine_version:
            raise ValueError("Engine versions differ; reanalyze both snapshots before comparison")
        def keyed(index):
            return {(n.source.file, n.qualified_name, n.kind): n for n in index.nodes.values() if n.source and n.kind in STRUCTURE}
        left, right = keyed(self), keyed(other)
        def body(index, n):
            return "\n".join(index.files[n.source.file].source.splitlines()[n.source.start_line - 1:n.source.end_line])
        changed = [{"before": left[k], "after": right[k], "signature_changed": left[k].signature != right[k].signature}
                   for k in sorted(left.keys() & right.keys()) if body(self, left[k]) != body(other, right[k]) or left[k].signature != right[k].signature]
        compatibility = []
        for key, node in sorted(left.items()):
            if node.kind not in {"Function", "Method"}:
                continue
            target = right.get(key)
            old_flow = self.analysis.flows.get(node.id)
            new_flow = other.analysis.flows.get(target.id) if target else None
            # IDs alone are unsafe: operation IDs historically depend on AST traversal order.
            def fingerprint(flow):
                if flow is None:
                    return None
                return (flow.entry, [(o.id, o.kind, o.expression, o.reads, o.writes) for o in sorted(flow.operations, key=lambda o: o.id)],
                        sorted((e.source, e.target, e.kind, e.label) for e in flow.edges))
            same = bool(old_flow and new_flow and fingerprint(old_flow) == fingerprint(new_flow))
            compatibility.append({"before_id": node.id, "after_id": target.id if target else None,
                                  "name": node.qualified_name, "compatible": same,
                                  "reason": "Flux identique" if same else "Fonction supprimée ou renommée" if not target else "Flux modifié ou indisponible : parcours à reconstruire"})
        def edge_keys(index):
            return {(index.nodes[e.source].qualified_name, index.nodes[e.target].qualified_name, e.kind, str(e.resolution)) for e in index.structural if e.kind != "CONTAINS"}
        le, re = edge_keys(self), edge_keys(other)
        added = [right[k] for k in sorted(right.keys() - left.keys())]
        removed = [left[k] for k in sorted(left.keys() - right.keys())]
        changed_functions = [c for c in changed if c["before"].kind in {"Function", "Method"}]
        previous_functions = [c["before"] for c in changed_functions] + [n for n in removed if n.kind in {"Function", "Method"}]
        return {"before": self.analysis.repository, "after": other.analysis.repository, "engine_version": self.analysis.engine_version,
                "added": added, "removed": removed, "changed": changed, "path_compatibility": compatibility,
                "previous_impacts": [{"symbol": n, "impact": self.impact(n.id, limit=50)} for n in previous_functions[:50]],
                "relations_added": sorted(re - le), "relations_removed": sorted(le - re),
                "impacts": [{"symbol": c["after"], "impact": other.impact(c["after"].id, limit=50)} for c in changed_functions[:50]],
                "impact_truncated": len(changed_functions) > 50 or len(previous_functions) > 50,
                "limitation": LIMITATION + " Appariement par fichier, nom qualifié et type ; renommages présentés comme ajout/suppression."}
