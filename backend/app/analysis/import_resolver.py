"""Conservative lexical/import/type resolution; ambiguity remains visible."""
import ast
from app.analysis.ast_parser import Parsed, expr, location, stable_id
from app.models.schema import GraphNode, Diagnostic


class ImportResolver:
    def __init__(self, parsed: Parsed):
        self.parsed = parsed
        self.nodes = {n.id: n for n in parsed.nodes}
        self.aliases: dict[str, dict[str, list[str]]] = {}
        self.import_records: list[dict] = []
        self.types: dict[tuple[str, str], set[str]] = {}
        self.uncertain_types: set[tuple[str, str]] = set()
        self.bindings: dict[tuple[str, str], set[str]] = {}
        self.shadowed: set[tuple[str, str]] = set()
        self.bases: dict[str, list[str]] = {}
        self.conditional_aliases: set[tuple[str, str]] = set()

    def external(self, name: str, file: str, node: ast.AST, unknown=False) -> str:
        key = stable_id("unresolved" if unknown else "external", name)
        if key not in self.nodes:
            symbol = GraphNode(id=key, kind="Unknown" if unknown else "ExternalDependency", name=name,
                qualified_name=name, source=location(file, node) if unknown else None)
            self.nodes[key] = symbol
            self.parsed.nodes.append(symbol)
        return key

    def resolve_imports(self):
        for scope, file, node, conditional in self.parsed.imports:
            aliases = self.aliases.setdefault(scope, {})
            current_module = self.nodes[scope]
            while current_module.parent:
                current_module = self.nodes[current_module.parent]
            package = current_module.qualified_name.split(".")
            if not file.endswith("__init__.py"):
                package = package[:-1]
            for alias in node.names:
                if isinstance(node, ast.Import):
                    qualified = alias.name
                    local = alias.asname or alias.name.split(".")[0]
                    target_name = qualified if alias.asname else local
                else:
                    prefix = node.module or ""
                    if node.level:
                        prefix = ".".join(package[:len(package) - node.level + 1] + ([prefix] if prefix else []))
                    qualified = ".".join(p for p in [prefix, alias.name] if p)
                    local = alias.asname or alias.name
                    target_name = qualified
                targets = self.qualified(target_name)
                if not targets:
                    internal = target_name.split(".")[0] in {m.split(".")[0] for m in self.parsed.modules}
                    targets = [self.external(target_name, file, node, internal or alias.name == "*")]
                aliases.setdefault(local, []).extend(targets)
                if conditional:
                    self.conditional_aliases.add((scope, local))
                self.import_records.append(dict(scope=scope, targets=targets, local=local,
                    qualified=qualified, file=file, node=node, conditional=conditional))

        for _ in range(min(len(self.import_records) + 1, 100)):
            changed = False
            for record in self.import_records:
                module, _, member = record["qualified"].rpartition(".")
                module_id = self.parsed.modules.get(module)
                candidates = self.aliases.get(module_id, {}).get(member, []) if module_id else []
                candidates = [t for t in candidates if self.nodes[t].kind != "Unknown"]
                if candidates and set(candidates) != set(record["targets"]):
                    record["targets"] = list(dict.fromkeys(candidates))
                    # Keep all conditional bindings instead of overwriting a sibling import.
                    self.aliases[record["scope"]][record["local"]] = list(dict.fromkeys(
                        t for sibling in self.import_records
                        if sibling["scope"] == record["scope"] and sibling["local"] == record["local"]
                        for t in sibling["targets"]))
                    self.conditional_aliases.add((record["scope"], record["local"]))
                    changed = True
            if not changed:
                break
        else:
            self.parsed.diagnostics.append(Diagnostic(code="partial_imports", message="Réexportations : limite de 100 passes atteinte ; certaines cibles restent partielles."))
        referenced = {t for record in self.import_records for t in record["targets"]}
        orphaned = {key for key, node in self.nodes.items() if node.kind == "Unknown" and key not in referenced}
        for key in orphaned:
            del self.nodes[key]
        self.parsed.nodes[:] = [node for node in self.parsed.nodes if node.id not in orphaned]
        for record in self.import_records:
            if record["local"] == "*" or any(self.nodes[t].kind == "Unknown" for t in record["targets"]):
                self.parsed.diagnostics.append(Diagnostic(code="partial_import", message=f"Import partiel : {record['qualified']} ; étoile, cycle ou cible absente non résolus.", source=location(record["file"], record["node"])))

    def qualified(self, name: str) -> list[str]:
        return [n.id for n in self.nodes.values() if n.qualified_name == name]

    def lookup(self, name: str, scope: str) -> list[str]:
        current: str | None = scope
        while current:
            if (current, name) in self.shadowed:
                return list(self.bindings.get((current, name), set()))
            found = self.parsed.scopes.get(current, {}).get(name)
            if found:
                return found
            found = self.aliases.get(current, {}).get(name)
            if found:
                return found
            parent = self.nodes[current].parent
            # Method bare names use module/closure scope, not the class namespace.
            if parent and self.nodes[parent].kind == "Class" and self.nodes[current].kind in {"Method", "Function"}:
                parent = self.nodes[parent].parent
            current = parent
        return []

    def member(self, class_id: str, name: str, visited: set[str] | None = None) -> list[str]:
        visited = set() if visited is None else visited
        if class_id in visited:
            return []
        visited.add(class_id)
        direct = self.parsed.scopes.get(class_id, {}).get(name, [])
        if direct:
            return direct
        result = []
        for base in self.bases.get(class_id, []):
            result.extend(self.member(base, name, visited.copy()))
        return list(dict.fromkeys(result))

    def enclosing_class(self, scope: str) -> str | None:
        node = self.nodes[scope]
        while node.parent:
            node = self.nodes[node.parent]
            if node.kind == "Class":
                return node.id
        return None

    def resolve(self, node: ast.AST, scope: str) -> list[str]:
        if isinstance(node, ast.Name):
            if node.id in {"self", "cls"} and "staticmethod" not in self.nodes[scope].metadata.get("decorators", []):
                class_id = self.enclosing_class(scope)
                if class_id:
                    return [class_id]
            return self.lookup(node.id, scope)
        if isinstance(node, ast.Attribute):
            base = self.resolve(node.value, scope)
            type_key = (scope, expr(node.value))
            base += sorted(self.types.get(type_key, set()))
            class_id = self.enclosing_class(scope)
            if class_id:
                base += sorted(self.types.get((class_id, expr(node.value)), set()))
            result = []
            for target in dict.fromkeys(base):
                symbol = self.nodes[target]
                if symbol.kind == "Class":
                    result += self.member(target, node.attr)
                elif symbol.kind == "Module":
                    result += self.parsed.scopes.get(target, {}).get(node.attr, [])
                    result += self.aliases.get(target, {}).get(node.attr, [])
                    result += self.qualified(symbol.qualified_name + "." + node.attr)
                elif symbol.kind == "ExternalDependency":
                    source_location = self.nodes[scope].source
                    assert source_location is not None
                    result.append(self.external(symbol.qualified_name + "." + node.attr,
                        source_location.file, node))
            return list(dict.fromkeys(result))
        return []

    def status(self, targets: list[str], node: ast.AST | None = None, scope: str = "") -> str:
        if not targets:
            return "unresolved"
        if all(self.nodes[t].kind == "ExternalDependency" for t in targets):
            return "external"
        if all(self.nodes[t].kind == "Unknown" for t in targets):
            return "unresolved"
        if len(targets) > 1 or any(self.nodes[t].metadata.get("conditional") for t in targets):
            return "candidate"
        if isinstance(node, ast.Name):
            current: str | None = scope
            while current:
                if (current, node.id) in self.conditional_aliases or (current, node.id) in self.bindings:
                    return "candidate"
                if node.id in self.parsed.scopes.get(current, {}) or node.id in self.aliases.get(current, {}):
                    break
                current = self.nodes[current].parent
        if any(any(d not in {"staticmethod", "classmethod"} for d in self.nodes[t].metadata.get("decorators", [])) for t in targets):
            return "candidate"
        if isinstance(node, ast.Attribute):
            if any((target, node.attr) in self.conditional_aliases for target in self.resolve(node.value, scope)):
                return "candidate"
            key = (scope, expr(node.value))
            class_id = self.enclosing_class(scope)
            if key in self.uncertain_types or (class_id, expr(node.value)) in self.uncertain_types:
                return "candidate"
            if expr(node.value) not in {"self", "cls"} and key in self.types:
                return "candidate"  # flow-insensitive local type inference
        return "resolved"


