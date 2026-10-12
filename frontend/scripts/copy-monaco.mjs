import { cp, mkdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await mkdir(new URL('public/monaco', root), { recursive: true });
await cp(new URL('node_modules/monaco-editor/min/vs', root), new URL('public/monaco/vs', root), { recursive: true });
