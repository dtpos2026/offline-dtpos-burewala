// ============================================================
// Builds docs/user-guide/source/guide.html from the content files.
//
//   node docs/user-guide/tools/build-guide.mjs
//
// Content lives in source/content/*.mjs (plain text and HTML snippets — edit
// those to change the wording). Picture sizes and numbered markers come from
// screenshots/manifest.json, written by capture.mjs. Page numbers and the
// table of contents are worked out here, because every printed page is one
// fixed-size <section class="page">.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const SRC = path.join(root, 'source');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'screenshots', 'manifest.json'), 'utf8'));
const meta = (await import(pathToFileURL(path.join(SRC, 'content', 'meta.mjs')).href)).default;
const { moduleRows } = await import(pathToFileURL(path.join(SRC, 'content', 'modules.mjs')).href);
const parts = [];
for (const f of fs.readdirSync(path.join(SRC, 'content')).filter(f => /^part-\d+\.mjs$/.test(f)).sort()) {
  parts.push(...(await import(pathToFileURL(path.join(SRC, 'content', f)).href)).default);
}

// Page body box (mm): see .page-body in guide.css
const BODY_W = 269, BODY_H = 178;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------------------------------------------------------- figures
function shot(id) {
  const m = manifest[id];
  if (!m) throw new Error(`No screenshot "${id}" in manifest.json — run capture.mjs`);
  return m;
}
/** A picture fitted into maxW × maxH (mm), with its numbered markers. */
function fig(id, { maxW = 186, maxH = 150, caption = '', markers = true } = {}) {
  const m = shot(id);
  const aspect = m.w / m.h;
  let w = Math.min(maxW, maxH * aspect);
  let h = w / aspect;
  w = Math.round(w * 10) / 10; h = Math.round(h * 10) / 10;
  const mk = markers ? (m.markers || []).map(p => {
    const x = Math.min(97, Math.max(3, p.x)), y = Math.min(96, Math.max(4, p.y));
    return `<span class="mk" style="left:${x}%;top:${y}%">${p.n}</span>`;
  }).join('') : '';
  return {
    w, h,
    html: `<figure class="fig" style="width:${w}mm"><div class="frame" style="height:${h}mm"><img src="../screenshots/${m.file}" alt="${esc(caption || id)}">${mk}</div>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`,
  };
}
const legend = (items) => `<ol class="legend">${items.map((t, i) => `<li><span class="mk">${i + 1}</span>${t}</li>`).join('')}</ol>`;

// ---------------------------------------------------------------- page templates
function sectionHead(p) {
  return `<div class="sec-head">${p.kicker ? `<div class="kicker">${p.kicker}</div>` : ''}<h2 class="sec">${p.num ? `<span class="num">${p.num}</span>` : ''}${p.title}</h2>${p.lead ? `<p class="lead">${p.lead}</p>` : ''}</div>`;
}
const HEAD_H = (p) => 12 + (p.kicker ? 4 : 0) + (p.lead ? (p.lead.length > 150 ? 11 : 6) : 0);

const T = {
  // picture left, text right (text goes two-column when there is room)
  screen(p) {
    const maxH = p.figH || (BODY_H - HEAD_H(p) - (p.caption ? 6 : 0));
    const f = fig(p.shot, { maxW: p.figW || 186, maxH, caption: p.caption });
    const textW = BODY_W - f.w - 8;
    const body = (p.legend ? legend(p.legend) : '') + (p.html || '');
    return sectionHead(p) + `<div class="screen" style="height:auto">${f.html}<div class="text${textW >= 118 && !p.oneCol ? ' cols2' : ''}">${body}</div></div>`;
  },
  // two pictures side by side, each with its own text underneath
  pair(p) {
    const maxH = p.figH || 92;
    const cols = p.items.map(it => {
      const f = fig(it.shot, { maxW: p.figW || 128, maxH: it.figH || maxH, caption: it.caption });
      return `<div class="col">${f.html}<div>${it.legend ? legend(it.legend) : ''}${it.html || ''}</div></div>`;
    });
    return sectionHead(p) + `<div class="pair">${cols.join('')}</div>`;
  },
  // four pictures in a grid (looks / themes)
  quad(p) {
    const cells = p.items.map(it => fig(it.shot, { maxW: 128, maxH: 60, caption: it.caption, markers: false }).html);
    return sectionHead(p) + `<div class="quad">${cells.join('')}</div>${p.html || ''}`;
  },
  // text only, in columns
  text(p) {
    return sectionHead(p) + `<div class="cols ${p.cols === 1 ? '' : p.cols === 3 ? 'c3' : 'c2'}">${p.html}</div>`;
  },
  raw(p) { return sectionHead(p) + p.html; },
  // the complete module list: one row per module, with the guide page that explains it
  modules(p) {
    const all = moduleRows();
    const flat = all.flatMap(g => g.items);
    const nums = { total: flat.length, available: flat.filter(i => i.offline).length, unavailable: flat.filter(i => !i.offline).length };
    const lead = (p.lead || '').replace(/\{(total|available|unavailable)\}/g, (_, k) => nums[k]);
    const pageOf = (ref) => { const t = toc.find(e => String(e.num) === ref); if (!t) throw new Error(`modules: no section ${ref}`); return t.page; };
    const groups = all.filter(g => p.groups.includes(g.group));
    const body = groups.map(g => `<div class="mgroup"><h4>${esc(g.group)} <span>${g.items.length}</span></h4>${g.items.map(i => `<div class="mrow${i.offline ? '' : ' off'}"><span class="mn">${esc(i.name)}${i.offline ? '' : ' <em>online edition only</em>'}</span><span class="mw">${esc(i.what)}</span><span class="mp">${i.ref} · p.&nbsp;${pageOf(i.ref)}</span></div>`).join('')}</div>`).join('');
    return sectionHead({ ...p, lead }) + `<div class="modlist">${body}</div>${p.after || ''}`;
  },
};

// ---------------------------------------------------------------- assemble
const pages = []; // { kind, html, toc?: {level, title, num}, chapter? }
const toc = [];
const logo = '../brand/dt-mark-brand.png';      // purple mark, for white pages
const logoWhite = '../brand/dt-mark.png';       // white mark, for the purple cover and back

pages.push({ kind: 'cover' });
const TOC_PAGES = 3;
for (let i = 0; i < TOC_PAGES; i++) pages.push({ kind: 'toc', i });

for (const ch of parts) {
  const chPage = pages.length + 1;
  pages.push({ kind: 'opener', ch });
  toc.push({ level: 1, num: ch.n, title: ch.title, page: chPage, id: `ch-${ch.n}` });
  for (const p of ch.pages) {
    const pg = pages.length + 1;
    pages.push({ kind: 'content', ch, p });
    if (p.title && p.toc !== false) toc.push({ level: 2, num: p.num || '', title: p.tocTitle || p.title.replace(/<[^>]+>/g, ''), page: pg, id: `p-${pg}` });
  }
}
pages.push({ kind: 'back' });

function frame(inner, pageNo, chTitle) {
  return `<section class="page" id="pg-${pageNo}" data-page="${pageNo}">
  <header class="page-head"><span><b>DT POS Enterprise</b> · User Guide &amp; Feature Overview · v${meta.version}</span><span class="chap">${chTitle}</span></header>
  <div class="page-body">${inner}</div>
  <footer class="page-foot"><span class="brand"><img src="${logo}" alt="">Digital Target · ${meta.email} · ${meta.phone}</span><span class="num">${pageNo}</span></footer>
</section>`;
}

function renderToc(i) {
  // split the entries over the TOC pages by chapter
  const chapters = [];
  for (const e of toc) { if (e.level === 1) chapters.push({ ...e, rows: [] }); else chapters[chapters.length - 1].rows.push(e); }
  // balance the chapters over the TOC pages by number of lines
  const weight = (c) => c.rows.length + 2.2;
  const total = chapters.reduce((n, c) => n + weight(c), 0);
  const groups = Array.from({ length: TOC_PAGES }, () => []);
  let acc = 0;
  for (const c of chapters) { const g = Math.min(TOC_PAGES - 1, Math.floor(acc / (total / TOC_PAGES))); groups[g].push(c); acc += weight(c); }
  const mine = groups[i];
  const html = mine.map(c => `<div class="ch"><div class="ch-title"><span class="n">${c.num}</span>${esc(c.title)}<span class="dots"></span><span class="pg">${c.page}</span></div>${c.rows.map(r => `<div class="row">${r.num ? `<span class="mono" style="color:#8a83a3;min-width:9mm">${r.num}</span>` : ''}<span>${esc(r.title)}</span><span class="dots"></span><span class="pg">${r.page}</span></div>`).join('')}</div>`).join('');
  return sectionHead({ kicker: i === 0 ? 'Contents' : 'Contents (continued)', title: i === 0 ? 'What is inside' : 'What is inside — continued' }) + `<div class="toc" style="height:152mm">${html}</div>`;
}

let html = '';
pages.forEach((pg, idx) => {
  const no = idx + 1;
  if (pg.kind === 'cover') html += meta.cover({ logo, logoWhite, version: meta.version, date: meta.date });
  else if (pg.kind === 'back') html += meta.back({ logo, logoWhite, version: meta.version });
  else if (pg.kind === 'toc') html += frame(renderToc(pg.i), no, 'Contents');
  else if (pg.kind === 'opener') {
    const ch = pg.ch;
    const rows = toc.filter(t => t.level === 2 && t.id && String(t.num).split('.')[0] === String(ch.n));
    const thumb = ch.thumb ? `<div class="thumb"><img src="../screenshots/${shot(ch.thumb).file}" alt=""></div>` : '<div></div>';
    html += `<section class="page opener" id="pg-${no}" data-page="${no}"><div class="inner"><div><div class="big">${String(ch.n).padStart(2, '0')}</div><h1>${ch.title}</h1><p>${ch.intro}</p><ul>${rows.map(r => `<li>${esc(r.title)}<span>${r.page}</span></li>`).join('')}</ul></div>${thumb}</div><div class="foot"><span>DT POS Enterprise · User Guide</span><span>${no}</span></div></section>`;
  } else {
    const p = pg.p;
    const tpl = T[p.type || 'screen'];
    if (!tpl) throw new Error(`Unknown page type ${p.type}`);
    html += frame(tpl(p), no, `${pg.ch.n}. ${pg.ch.title}`);
  }
  html += '\n';
});

const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>DT POS Enterprise — User Guide & Feature Overview</title>
<meta name="author" content="Digital Target">
<link rel="stylesheet" href="guide.css">
</head>
<body>
${html}
<script>
// Marks any page whose content does not fit (used by render-pdf.mjs; harmless when viewing).
window.__checkPages = () => Array.from(document.querySelectorAll('.page')).map(pg => {
  const body = pg.querySelector('.page-body');
  if (!body) return null;
  const box = body.getBoundingClientRect();
  let worst = 0, side = 0;
  body.querySelectorAll('*').forEach(el => { const r = el.getBoundingClientRect(); if (r.height > 0 && r.width > 0) { worst = Math.max(worst, r.bottom - box.bottom - 0.5); side = Math.max(side, r.right - box.right - 0.5); } });
  const sideways = side > 0;
  if (worst > 1 || sideways) { pg.classList.add('overflow'); return { page: +pg.dataset.page, by: Math.round(worst), sideways }; }
  return null;
}).filter(Boolean);
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(SRC, 'guide.html'), doc);
fs.writeFileSync(path.join(SRC, 'toc.json'), JSON.stringify(toc, null, 1));
console.log(`guide.html: ${pages.length} pages, ${toc.filter(t => t.level === 1).length} chapters, ${toc.filter(t => t.level === 2).length} sections`);
