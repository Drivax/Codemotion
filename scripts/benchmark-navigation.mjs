import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
const snapshot = JSON.parse(fs.readFileSync('.codemotion/snapshots/e460fb3e9ea1f9637f9223b5.json', 'utf8'));
const symbols = snapshot.nodes, cards = symbols.filter(s => s.kind === 'Class').slice(0, 60);
function measure(fn) { for(let i=0;i<3;i++) fn(); const times=[]; for(let i=0;i<15;i++){const t=performance.now();fn();times.push(performance.now()-t);}times.sort((a,b)=>a-b);return +times[7].toFixed(3); }
const indexed = symbols.filter(s=>s.source && ['Class','Function','Method','Module'].includes(s.kind)).map(s=>({s,text:(s.qualified_name+' '+s.source.file).toLowerCase()}));
const members = new Map(); for(const s of symbols) if(['Method','Attribute'].includes(s.kind)){const list=members.get(s.parent)||[];list.push(s);members.set(s.parent,list);}
const file = snapshot.files.find(f=>f.path.endsWith('credit_limit_env.py')) || snapshot.files.filter(f=>f.path.endsWith('.py')).sort((a,b)=>b.source.length-a.source.length)[0];
const result={snapshot:snapshot.repository.snapshot,symbols:symbols.length,graph_cards:cards.length,iterations:15,metric:'median milliseconds, warm JS computations; not end-to-end browser latency',search_before_ms:measure(()=>symbols.filter(s=>s.source&&['Class','Function','Method','Module'].includes(s.kind)&&(s.qualified_name+' '+s.source.file).toLowerCase().includes('step'))),search_after_ms:measure(()=>indexed.filter(x=>x.text.includes('step'))),graph_members_before_ms:measure(()=>cards.map(n=>symbols.filter(s=>s.parent===n.id&&['Method','Attribute'].includes(s.kind)))),graph_members_after_ms:measure(()=>cards.map(n=>members.get(n.id)||[])),preview_file:file.path,preview_full_bytes:Buffer.byteLength(file.source),preview_30_lines_bytes:Buffer.byteLength(file.source.split('\n').slice(0,30).join('\n'))};
fs.writeFileSync('docs/navigation-v5-performance.json',JSON.stringify(result,null,2)+'\n'); console.log(JSON.stringify(result,null,2));
