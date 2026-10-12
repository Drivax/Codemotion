'use client';
import { useEffect, useRef, useState } from 'react';
import Editor, { loader, type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type { SourceLocation, SymbolNode } from '@/lib/types';
loader.config({ paths: { vs: '/monaco/vs' } });
export default function SourceEditor({ source, location, symbols, onSelect, light }: {
  source: string; location: SourceLocation | null; symbols: SymbolNode[]; onSelect: (id: string) => void; light: boolean;
}) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const decorations = useRef<editor.IEditorDecorationsCollection | null>(null);
  const [ready, setReady] = useState(false);
  const latest = useRef({ symbols, onSelect, location });
  latest.current = { symbols, onSelect, location };
  const mounted: OnMount = ed => {
    editorRef.current = ed;
    decorations.current = ed.createDecorationsCollection();
    ed.onMouseDown(event => {
      const position = event.target.position;
      if (!position) return;
      const matches = latest.current.symbols.filter(s => s.source !== null && s.source.file === latest.current.location?.file && s.source.start_line <= position.lineNumber && s.source.end_line >= position.lineNumber);
      matches.sort((a, b) => (a.source!.end_line - a.source!.start_line) - (b.source!.end_line - b.source!.start_line));
      if (matches[0]) latest.current.onSelect(matches[0].id);
    });
    setReady(true);
  };
  useEffect(() => {
    if (!location || !ready) return;
    decorations.current?.set([{ range: { startLineNumber: location.start_line, endLineNumber: location.end_line, startColumn: 1, endColumn: 1 }, options: { isWholeLine: true, className: 'source-highlight', linesDecorationsClassName: 'source-gutter' } }]);
    editorRef.current?.revealLineInCenter(location.start_line);
  }, [location, source, ready]);
  return <Editor height="100%" language="python" theme={light ? 'vs' : 'vs-dark'} value={source} path={location?.file || 'source.py'} onMount={mounted}
    loading={<div className="empty-small">Loading local source editor…</div>} options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, fontFamily: 'Consolas, monospace', scrollBeyondLastLine: false, automaticLayout: true, lineNumbersMinChars: 4, renderLineHighlight: 'none', padding: { top: 14 }, folding: true }} />;
}

