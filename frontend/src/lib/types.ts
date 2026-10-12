export interface SourceLocation { file: string; start_line: number; end_line: number; start_column: number; end_column: number }
export type Resolution = 'resolved' | 'candidate' | 'unresolved' | 'external';
export interface SymbolNode {
  id: string; kind: string; name: string; qualified_name: string; source: SourceLocation | null;
  parent: string | null; signature: string; docstring: string;
  metadata: { decorators?: string[]; bases?: string[]; annotation?: string; literal?: string | null;
    storage?: string; expression?: string; resolution?: Resolution; targets?: string[];
    parameters?: string[]; returns?: string; async?: boolean; generator?: boolean;
    dataclass?: boolean; conditional?: boolean; inferred_types?: string[]; arguments?: string[] };
}
export interface Relation { id: string; source: string; target: string; kind: string; resolution: Resolution; provenance: SourceLocation | null; label: string }
export interface Graph { nodes: SymbolNode[]; edges: Relation[]; total: number }
export interface Details { symbol: SymbolNode; children: SymbolNode[]; relations: Relation[] }
export interface FileRecord { path: string; package: string; parsed: boolean; source?: string }
export interface Diagnostic { code: string; message: string; severity: 'info' | 'warning' | 'error'; source: SourceLocation | null }
export interface Summary {
  repository: { id: string; name: string; snapshot: string; revision: string | null };
  files: FileRecord[]; diagnostics: Diagnostic[]; metrics: Record<string, number>;
}
export interface Operation { id: string; kind: string; expression: string; source: SourceLocation;
  reads: string[]; writes: string[]; definitions: Record<string, string>; literal: string | null; calls: string[]; explanation: string }
export interface FlowLink { source: string; target: string; kind: 'control' | 'data'; label: string }
export interface Flow { function_id: string; entry: string; operations: Operation[]; edges: FlowLink[]; limitations: string[] }
export interface Job { id: string; status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'; progress: string; repository_id: string | null; error: string | null }
