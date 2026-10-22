// Lists every "(x.y)" cross-reference in the guide text that points at a section that does not exist.
//   node docs/user-guide/tools/check-refs.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toc = JSON.parse(fs.readFileSync(path.join(root, 'source', 'toc.json'), 'utf8'));
const have = new Set(toc.map(t => String(t.num)));
const html = fs.readFileSync(path.join(root, 'source', 'guide.html'), 'utf8').replace(/<[^>]+>/g, ' ');
const bad = new Set();
for (const m of html.matchAll(/\((\d{1,2}\.\d{1,2})(?:[–,\s-]+(\d{1,2}\.\d{1,2}))*\)/g)) {
  for (const n of m[0].match(/\d{1,2}\.\d{1,2}/g)) if (!have.has(n)) bad.add(n);
}
for (const m of html.matchAll(/\bchapters? (\d{1,2})\b/g)) if (!toc.some(t => t.level === 1 && String(t.num) === m[1])) bad.add('chapter ' + m[1]);
console.log(bad.size ? `Unknown references: ${[...bad].join(', ')}` : 'All cross-references point at existing sections.');
process.exit(bad.size ? 1 : 0);
