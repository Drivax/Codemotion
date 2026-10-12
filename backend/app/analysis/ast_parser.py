"""AST parsing and lexical symbol indexing; never imports analyzed modules."""
import ast
import hashlib
from dataclasses import dataclass, field
from app.models.schema import Diagnostic, GraphNode, SourceLocation


def stable_id(*parts: object) -> str:
    return hashlib.sha256("\0".join(map(str, parts)).encode()).hexdigest()[:24]


def location(file: str, node: ast.AST) -> SourceLocation:
    return SourceLocation(file=file, start_line=getattr(node, "lineno", 1),
                          end_line=getattr(node, "end_lineno", 1) or 1,
                          start_column=getattr(node, "col_offset", 0),
                          end_column=getattr(node, "end_col_offset", 0) or 0)


def expr(node: ast.AST | None) -> str:
    return ast.unparse(node) if node is not None else ""


def module_name(path: str) -> str:
    parts = path.removesuffix(".py").split("/")
    if parts[0] == "src":
        parts.pop(0)
    if parts[-1] == "__init__":
        parts.pop()
    return ".".join(parts) or "__root__"


def local_walk(node: ast.AST):
    """Traverse a body without mistaking nested definitions for its execution."""
    yield node
    children = node.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) else ast.iter_child_nodes(node)
    for child in children:
        if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)):
            continue
        yield from local_walk(child)


@dataclass
class Parsed:
    nodes: list[GraphNode] = field(default_factory=list)
    trees: dict[str, ast.Module] = field(default_factory=dict)
    definitions: dict[str, ast.AST] = field(default_factory=dict)
    scopes: dict[str, dict[str, list[str]]] = field(default_factory=dict)
    imports: list[tuple[str, str, ast.Import | ast.ImportFrom, bool]] = field(default_factory=list)
    diagnostics: list[Diagnostic] = field(default_factory=list)
    modules: dict[str, str] = field(default_factory=dict)


class ASTParser(ast.NodeVisitor):
    def __init__(self):
        self.result = Parsed()
        self.file = ""
        self.stack: list[GraphNode] = []
        self.conditional = 0

    def parse(self, files: dict[str, str]) -> Parsed:
        for file, source in sorted(files.items()):
            self.file = file
            name = module_name(file)
            module = GraphNode(id=stable_id(file, "module"), kind="Module", name=file.split("/")[-1],
                               qualified_name=name, source=SourceLocation(file=file, end_line=max(1, len(source.splitlines()))))
            self.result.nodes.append(module)
            self.result.modules[name] = module.id
            self.result.scopes[module.id] = {}
            self.stack = [module]
            try:
                tree = ast.parse(source, filename=file)
            except (SyntaxError, ValueError, RecursionError) as error:
                self.result.diagnostics.append(Diagnostic(code="parse_error", message=str(error), severity="error",
                    source=SourceLocation(file=file, start_line=getattr(error, "lineno", 1) or 1)))
                continue
            self.result.trees[file] = tree
            self.result.definitions[module.id] = tree
            self.visit(tree)
        return self.result

    def definition(self, node: ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef):
        parent = self.stack[-1]
        is_class = isinstance(node, ast.ClassDef)
        kind = "Class" if is_class else "Method" if parent.kind == "Class" else "Function"
        symbol = GraphNode(id=stable_id(self.file, parent.id, node.name, node.lineno), kind=kind,
            name=node.name, qualified_name=parent.qualified_name + "." + node.name,
            source=location(self.file, node), parent=parent.id, docstring=ast.get_docstring(node) or "",
            metadata={"decorators": [expr(d) for d in node.decorator_list], "conditional": bool(self.conditional)})
        if isinstance(node, ast.ClassDef):
            symbol.metadata["bases"] = [expr(b) for b in node.bases]
            symbol.metadata["dataclass"] = any("dataclass" in expr(d) for d in node.decorator_list)
            symbol.metadata["abstract"] = any("ABC" in expr(b) for b in node.bases)
        else:
            symbol.signature = f"{node.name}({expr(node.args)})" + (f" -> {expr(node.returns)}" if node.returns else "")
            symbol.metadata.update({"async": isinstance(node, ast.AsyncFunctionDef),
                "returns": expr(node.returns), "generator": any(isinstance(n, (ast.Yield, ast.YieldFrom)) for n in local_walk(node))})
        self.result.nodes.append(symbol)
        self.result.definitions[symbol.id] = node
        self.result.scopes[parent.id].setdefault(node.name, []).append(symbol.id)
        self.result.scopes[symbol.id] = {}
        self.stack.append(symbol)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            args = node.args
            params = [*args.posonlyargs, *args.args, *([args.vararg] if args.vararg else []),
                      *args.kwonlyargs, *([args.kwarg] if args.kwarg else [])]
            symbol.metadata["parameters"] = []
            for arg in params:
                parameter = GraphNode(id=stable_id(symbol.id, "parameter", arg.arg), kind="Parameter", name=arg.arg,
                    qualified_name=symbol.qualified_name + "." + arg.arg, parent=symbol.id,
                    source=location(self.file, arg), metadata={"annotation": expr(arg.annotation)})
                self.result.nodes.append(parameter)
                self.result.scopes[symbol.id][arg.arg] = [parameter.id]
                symbol.metadata["parameters"].append(parameter.id)
        for statement in node.body:
            self.visit(statement)
        self.stack.pop()

    visit_ClassDef = definition
    visit_FunctionDef = definition
    visit_AsyncFunctionDef = definition

    def visit_Import(self, node):
        self.result.imports.append((self.stack[-1].id, self.file, node, bool(self.conditional)))

    visit_ImportFrom = visit_Import

    def visit_If(self, node):
        self.conditional += 1
        self.generic_visit(node)
        self.conditional -= 1

    visit_Try = visit_If
    visit_Match = visit_If
