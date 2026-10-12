"""Control-flow construction and fixed-point reaching definitions.

No expression is evaluated. Loops are cycles, and both conditional paths remain.
Unsupported compound control structures are opaque and explicitly diagnosed.
"""
import ast
from collections import defaultdict
from app.analysis.ast_parser import expr, local_walk, location, stable_id
from app.models.schema import DataFlowGraph, FlowLink, FlowOperation


class ExplanationProvider:
    def explain(self, kind: str, expression: str) -> str:
        messages = {
            "condition": "Two hypothetical paths; this condition has not been evaluated.",
            "loop": "Explore the body symbolically or leave the loop. No observed iteration count.",
            "return": "Return this symbolic expression; its runtime value is unavailable.",
            "input": "Declared input; its runtime value is unavailable.",
            "unknown": "Opaque control structure. Internal execution order is not inferred.",
            "call": "Call detected in the AST. Inspect its resolution before entering the callee.",
            "join": "Possible control paths meet here; reaching definitions remain separate.",
            "assignment": "Define a new symbolic version from the expression shown.",
        }
        return messages.get(kind, "Source operation; no runtime execution is performed.")


def variable_accesses(node: ast.AST) -> tuple[list[str], list[str]]:
    reads, writes = set(), set()
    for child in local_walk(node):
        if isinstance(child, (ast.Name, ast.Attribute)):
            name = expr(child)
            if isinstance(child.ctx, ast.Load):
                reads.add(name)
            elif isinstance(child.ctx, ast.Store):
                writes.add(name)
        if isinstance(child, ast.AugAssign):
            reads.add(expr(child.target))
    return sorted(reads), sorted(writes)


class DataFlowAnalyzer:
    def __init__(self, function_id: str, file: str, max_nodes=2000):
        self.id = function_id
        self.file = file
        self.max_nodes = max_nodes
        self.operations: list[FlowOperation] = []
        self.links: list[FlowLink] = []
        self.limitations: list[str] = []
        self.explanations = ExplanationProvider()
        self.calls: dict[tuple[int, int], list[str]] = {}

    def op(self, node: ast.AST, kind: str, expression: str | None = None, reads=None, writes=None) -> str:
        if len(self.operations) >= self.max_nodes:
            raise ValueError("Function exceeds flow node limit")
        identifier = stable_id(self.id, "op", len(self.operations))
        detected_reads, detected_writes = variable_accesses(node)
        text = expression if expression is not None else expr(node)
        write_names = detected_writes if writes is None else writes
        call_ids = []
        call_nodes = local_walk(node) if kind not in {"input", "exit", "join", "definition"} else []
        for child in call_nodes:
            if isinstance(child, ast.Call):
                call_ids += self.calls.get((child.lineno, child.col_offset), [])
        self.operations.append(FlowOperation(id=identifier, kind=kind, expression=text,
            source=location(self.file, node), reads=detected_reads if reads is None else reads,
            writes=write_names, definitions={name: f"{name}@{identifier[:8]}" for name in write_names},
            literal=expr(node.value) if isinstance(node, (ast.Assign, ast.AnnAssign)) and isinstance(node.value, ast.Constant) else None,
            calls=call_ids, explanation=self.explanations.explain(kind, text)))
        return identifier

    def link(self, source: str, target: str, label=""):
        self.links.append(FlowLink(source=source, target=target, label=label))

    def block(self, statements: list[ast.stmt], after: str, loop: tuple[str, str] | None = None) -> str:
        next_id = after
        for statement in reversed(statements):
            if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                current = self.op(statement, "definition", f"define {statement.name}", reads=[], writes=[statement.name])
                self.link(current, next_id)
            elif isinstance(statement, ast.If):
                join = self.op(statement.test, "join", "merge possible paths", reads=[], writes=[])
                self.link(join, next_id)
                yes = self.block(statement.body, join, loop)
                no = self.block(statement.orelse, join, loop)
                current = self.op(statement.test, "condition", expr(statement.test), writes=[])
                self.link(current, yes, "True")
                self.link(current, no, "False")
            elif isinstance(statement, (ast.For, ast.AsyncFor, ast.While)):
                test = statement.test if isinstance(statement, ast.While) else statement.iter
                current = self.op(test, "loop", expr(test), writes=[])
                normal_exit = self.block(statement.orelse, next_id, loop)
                body = self.block(statement.body, current, (current, next_id))
                if isinstance(statement, (ast.For, ast.AsyncFor)):
                    bind = self.op(statement.target, "assignment", f"{expr(statement.target)} ← next symbolic item", reads=[expr(statement.iter)])
                    self.link(bind, body)
                    body = bind
                self.link(current, body, "Body (symbolic)")
                self.link(current, normal_exit, "Exit")
            elif isinstance(statement, ast.Break):
                current = self.op(statement, "break")
                self.link(current, loop[1] if loop else next_id, "break")
            elif isinstance(statement, ast.Continue):
                current = self.op(statement, "continue")
                self.link(current, loop[0] if loop else next_id, "continue")
            elif isinstance(statement, (ast.Return, ast.Raise)):
                current = self.op(statement, "return" if isinstance(statement, ast.Return) else "raise")
                self.link(current, self.exit)
            elif isinstance(statement, (ast.Try, ast.TryStar, ast.With, ast.AsyncWith, ast.Match)):
                current = self.op(statement, "unknown", expr(statement))
                self.limitations.append(f"Line {statement.lineno}: {type(statement).__name__} is opaque; exceptional/internal paths are not expanded.")
                self.link(current, next_id, "possible continuation")
            else:
                kind = "assignment" if isinstance(statement, (ast.Assign, ast.AnnAssign, ast.AugAssign)) else "call" if any(isinstance(n, ast.Call) for n in local_walk(statement)) else "operation"
                current = self.op(statement, kind)
                self.link(current, next_id)
            next_id = current
        return next_id

    def build(self, tree: ast.FunctionDef | ast.AsyncFunctionDef) -> DataFlowGraph:
        self.exit = self.op(tree, "exit", "function exit", reads=[], writes=[])
        entry = self.block(tree.body, self.exit)
        args = tree.args
        parameters = [*args.posonlyargs, *args.args, *([args.vararg] if args.vararg else []),
                      *args.kwonlyargs, *([args.kwarg] if args.kwarg else [])]
        for parameter in reversed(parameters):
            current = self.op(parameter, "input", expr(parameter), reads=[], writes=[parameter.arg])
            self.link(current, entry)
            entry = current
        if not parameters:
            start = self.op(tree, "input", "function entry", reads=[], writes=[])
            self.link(start, entry)
            entry = start
        reachable = {entry}
        pending = [entry]
        successors: dict[str, list[str]] = defaultdict(list)
        for link in self.links:
            successors[link.source].append(link.target)
        while pending:
            for target in successors[pending.pop()]:
                if target not in reachable:
                    reachable.add(target)
                    pending.append(target)
        self.operations = [op for op in self.operations if op.id in reachable]
        self.links = [link for link in self.links if link.source in reachable and link.target in reachable]
        self.reaching_definitions()
        # Deterministic visual order by source, with synthetic entry/exit handled explicitly.
        self.operations.sort(key=lambda op: (0 if op.kind == "input" else 2 if op.kind == "exit" else 1, op.source.start_line, op.source.start_column, op.id))
        return DataFlowGraph(function_id=self.id, entry=entry, operations=self.operations,
                             edges=self.links, limitations=self.limitations)

    def reaching_definitions(self):
        predecessors: dict[str, list[str]] = defaultdict(list)
        for link in self.links:
            predecessors[link.target].append(link.source)
        incoming: dict[str, dict[str, set[str]]] = {op.id: {} for op in self.operations}
        outgoing: dict[str, dict[str, set[str]]] = {op.id: {} for op in self.operations}
        # Finite monotone data-flow lattice, bounded additionally for hostile inputs.
        for _ in range(min(len(self.operations) * 2 + 1, 4001)):
            changed = False
            for op in self.operations:
                merged: dict[str, set[str]] = {}
                for parent in predecessors[op.id]:
                    for name, definitions in outgoing[parent].items():
                        merged.setdefault(name, set()).update(definitions)
                incoming[op.id] = merged
                result = {name: set(defs) for name, defs in merged.items()}
                for name in op.writes:
                    result[name] = {op.id}
                if result != outgoing[op.id]:
                    outgoing[op.id] = result
                    changed = True
            if not changed:
                break
        else:
            self.limitations.append("Reaching-definition convergence limit reached; dependencies may be partial.")
        for op in self.operations:
            for name in op.reads:
                for definition in sorted(incoming[op.id].get(name, set())):
                    self.links.append(FlowLink(source=definition, target=op.id, kind="data", label=name))
