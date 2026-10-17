'use client';
import { useEffect, useRef, useState } from 'react';
import Editor, { loader, type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type { SourceLocation, SymbolNode } from '@/lib/types';
loader.config({ paths: { vs: '/monaco/vs' } });
export default function SourceEditor({ source, location, symbols, onSelect, light, onToken }: {
  source: string; location: SourceLocation | null; symbols: SymbolNode[]; onSelect: (id: string) => void; light: boolean; onToken?: (file: string, line: number, column: number) => void;
}) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const decorations = useRef<editor.IEditorDecorationsCollection | null>(null);
  const [ready, setReady] = useState(false);
  const latest = useRef({ symbols, onSelect, location, onToken });
  latest.current = { symbols, onSelect, location, onToken };
  const mounted: OnMount = (ed, monaco) => {
    editorRef.current = ed;
    decorations.current = ed.createDecorationsCollection();
    ed.onMouseDown(event => {
      const position = event.target.position;
      if (!position || !ed.getModel()?.getWordAtPosition(position)) return;
      if (latest.current.location) latest.current.onToken?.(latest.current.location.file, position.lineNumber, position.column - 1);
    });
    ed.addAction({ id: 'codemotion.references', label: 'CodeMotion : définition et références', keybindings: [monaco.KeyCode.F12], contextMenuGroupId: 'navigation', run: editor => { const pos = editor.getPosition(); const current = latest.current; if (pos && current.location && editor.getModel()?.getWordAtPosition(pos)) current.onToken?.(current.location.file, pos.lineNumber, pos.column - 1); } });
    setReady(true);
  };
  useEffect(() => {
    if (!location || !ready) return;
    decorations.current?.set([{ range: { startLineNumber: location.start_line, endLineNumber: location.end_line, startColumn: 1, endColumn: 1 }, options: { isWholeLine: true, className: 'source-highlight', linesDecorationsClassName: 'source-gutter' } }]);
    editorRef.current?.revealLineInCenter(location.start_line);
  }, [location, source, ready]);
  return <Editor height="100%" language="python" theme={light ? 'vs' : 'vs-dark'} value={source} path={location?.file || 'source.py'} onMount={mounted}
    loading={<div className="empty-small">Chargement de l’éditeur local…</div>} options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, fontFamily: 'Consolas, monospace', scrollBeyondLastLine: false, automaticLayout: true, lineNumbersMinChars: 4, renderLineHighlight: 'none', padding: { top: 14 }, folding: true }} />;
}

