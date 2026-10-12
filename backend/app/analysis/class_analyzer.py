"""Observed class attributes and conservative receiver evidence."""
import ast
from app.analysis.ast_parser import expr, local_walk, location, stable_id
from app.models.schema import GraphNode
from app.analysis.import_resolver import ImportResolver


class ClassAnalyzer:
    def __init__(self, resolver: ImportResolver):
        self.r = resolver

    def analyze(self):
        r = self.r
        for scope, tree in r.parsed.definitions.items():
            parent = r.nodes[scope]
            assert parent.source is not None
            for local in local_walk(tree):
                if isinstance(local, ast.Name) and isinstance(local.ctx, ast.Store):
                    r.shadowed.add((scope, local.id))
            for node in local_walk(tree):
                if not isinstance(node, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
                    continue
                targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                value = node.value
                for target in targets:
                    target_name = expr(target)
                    is_attribute = isinstance(target, ast.Attribute) and isinstance(target.value, ast.Name) and target.value.id in {"self", "cls"}
                    owner = r.enclosing_class(scope) if is_attribute else scope
                    if not owner:
                        continue
                    is_class = r.nodes[owner].kind == "Class"
                    if not isinstance(target, ast.Name) and not is_attribute:
                        continue
                    name = target.attr if isinstance(target, ast.Attribute) else expr(target)
                    identifier = stable_id(owner, "attribute" if is_class else "variable", name)
                    symbol = r.nodes.get(identifier)
                    if symbol is None:
                        annotation = expr(node.annotation) if isinstance(node, ast.AnnAssign) else ""
                        symbol = GraphNode(id=identifier, kind="Attribute" if is_class else "Variable", name=name,
                            qualified_name=r.nodes[owner].qualified_name + "." + name, parent=owner,
                            source=location(parent.source.file, node), metadata={"annotation": annotation,
                            "storage": "instance" if is_attribute else "class" if is_class else "local",
                            "literal": expr(value) if isinstance(value, ast.Constant) else None,
                            "expression": expr(value), "resolution": "unresolved", "assignments": []})
                        r.nodes[identifier] = symbol
                        r.parsed.nodes.append(symbol)
                    symbol.metadata["assignments"].append(location(parent.source.file, node).model_dump())
                    if isinstance(target, ast.Name) and not is_class:
                        r.shadowed.add((scope, name))
                    if isinstance(value, ast.Call):
                        types = {t for t in r.resolve(value.func, scope) if r.nodes[t].kind == "Class"}
                        if types:
                            r.types.setdefault((owner, target_name), set()).update(types)
                            symbol.metadata["inferred_types"] = sorted(r.types[(owner, target_name)])
                            symbol.metadata["resolution"] = "candidate"
                    elif isinstance(value, (ast.Name, ast.Attribute)) and not is_attribute:
                        matches = r.resolve(value, scope)
                        r.bindings.setdefault((scope, name), set()).update(matches)
                    if isinstance(node, ast.AnnAssign) and node.annotation:
                        annotation_node = node.annotation
                        if isinstance(annotation_node, ast.Constant) and isinstance(annotation_node.value, str):
                            try:
                                annotation_node = ast.parse(annotation_node.value, mode="eval").body
                            except SyntaxError:
                                continue
                        types = {t for t in r.resolve(annotation_node, scope) if r.nodes[t].kind == "Class"}
                        if types:
                            r.types.setdefault((owner, target_name), set()).update(types)
                            r.uncertain_types.add((owner, target_name))
                    if is_attribute or len(symbol.metadata["assignments"]) > 1:
                        r.uncertain_types.add((owner, target_name))
            if parent.kind in {"Function", "Method"}:
                for parameter in parent.metadata.get("parameters", []):
                    item = r.nodes[parameter]
                    annotation = item.metadata.get("annotation", "")
                    if annotation:
                        try:
                            types = {t for t in r.resolve(ast.parse(annotation, mode="eval").body, scope) if r.nodes[t].kind == "Class"}
                            r.types[(scope, item.name)] = types
                            r.uncertain_types.add((scope, item.name))
                        except SyntaxError:
                            pass

