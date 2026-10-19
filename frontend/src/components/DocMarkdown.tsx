import type { ReactNode } from 'react';
// Render only structural Markdown; raw HTML remains escaped React text.
export default function DocMarkdown({ body, inline }: { body: string; inline: (text: string) => ReactNode }) {
  const lines = body.split('\n'), blocks: ReactNode[] = [];
  const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  for (let i = 0; i < lines.length;) {
    const line = lines[i], key = i, fence = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (!line.trim()) { i++; continue; }
    if (fence) { const code: string[] = []; i++; while (i < lines.length && !lines[i].trim().startsWith(fence[1])) code.push(lines[i++]); i++; blocks.push(<figure key={key}><figcaption>{fence[2].trim() || 'Code'}</figcaption><pre><code>{code.join('\n')}</code></pre></figure>); continue; }
    if (line.includes('|') && lines[i + 1] && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) { const head = cells(line); i += 2; const rows: string[][] = []; while (i < lines.length && lines[i].includes('|')) rows.push(cells(lines[i++])); blocks.push(<div className="doc-table" key={key}><table><thead><tr>{head.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead><tbody>{rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{inline(c)}</td>)}</tr>)}</tbody></table></div>); continue; }
    const list = line.match(/^\s*(?:([-+*])|([0-9]+)[.)])\s+(.*)$/);
    if (list) { const ordered = !!list[2], items: ReactNode[] = []; while (i < lines.length) { const m = lines[i].match(/^\s*(?:([-+*])|([0-9]+)[.)])\s+(.*)$/); if (!m || !!m[2] !== ordered) break; items.push(<li key={i}>{inline(m[3])}</li>); i++; } blocks.push(ordered ? <ol key={key} start={Number(list[2])}>{items}</ol> : <ul key={key}>{items}</ul>); continue; }
    if (/^\s*>/.test(line)) { blocks.push(<blockquote key={key}>{inline(line.replace(/^\s*>\s?/, ''))}</blockquote>); i++; continue; }
    blocks.push(<p key={key}>{inline(line)}</p>); i++;
  }
  return <div className="doc-prose">{blocks}</div>;
}
