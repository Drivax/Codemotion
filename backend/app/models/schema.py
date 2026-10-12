"""Versioned, source-grounded wire format shared by both views."""
from enum import Enum
from typing import Any, Literal
from pydantic import BaseModel, Field


class Resolution(str, Enum):
    resolved = "resolved"
    candidate = "candidate"
    unresolved = "unresolved"
    external = "external"


class SourceLocation(BaseModel):
    file: str
    start_line: int = 1
    end_line: int = 1
    start_column: int = 0
    end_column: int = 0


class Diagnostic(BaseModel):
    code: str
    message: str
    severity: Literal["info", "warning", "error"] = "warning"
    source: SourceLocation | None = None


class GraphNode(BaseModel):
    id: str
    kind: str
    name: str
    qualified_name: str
    source: SourceLocation | None = None
    parent: str | None = None
    signature: str = ""
    docstring: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    kind: str
    resolution: Resolution = Resolution.resolved
    provenance: SourceLocation | None = None
    label: str = ""


class FlowOperation(BaseModel):
    id: str
    kind: str
    expression: str
    source: SourceLocation
    reads: list[str] = Field(default_factory=list)
    writes: list[str] = Field(default_factory=list)
    definitions: dict[str, str] = Field(default_factory=dict)
    literal: str | None = None
    calls: list[str] = Field(default_factory=list)
    explanation: str = ""


class FlowLink(BaseModel):
    source: str
    target: str
    kind: Literal["control", "data"] = "control"
    label: str = ""


class DataFlowGraph(BaseModel):
    function_id: str
    entry: str
    operations: list[FlowOperation]
    edges: list[FlowLink]
    limitations: list[str] = Field(default_factory=list)


class FileRecord(BaseModel):
    path: str
    package: str
    source: str
    parsed: bool = True


class Repository(BaseModel):
    id: str
    name: str
    revision: str | None = None
    snapshot: str


class Analysis(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    repository: Repository
    files: list[FileRecord] = Field(default_factory=list)
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)
    flows: dict[str, DataFlowGraph] = Field(default_factory=dict)
    diagnostics: list[Diagnostic] = Field(default_factory=list)
    metrics: dict[str, float] = Field(default_factory=dict)
