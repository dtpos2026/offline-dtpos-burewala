// ============================================================
// Renders source/guide.html to the PDF.
//
//   node docs/user-guide/tools/build-guide.mjs     (HTML from the content files)
//   node docs/user-guide/tools/render-pdf.mjs      (this script)
//   python3 docs/user-guide/tools/finish-pdf.py    (bookmarks + document info)
//
// Every page is checked first: if any content runs past its page (cut off),
// the script lists those pages and stops without writing the PDF.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const PW = process.env.PLAYWRIGHT_CORE || '/opt/node-tools/node_modules/playwright-core/index.mjs';
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch { ({ chromium } = await import(PW)); }

const html = path.join(root, 'source', 'guide.html');
const out = path.join(root, 'build', 'guide-body.pdf');
fs.mkdirSync(path.dirname(out), { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--font-render-hinting=none', '--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1123, height: 794 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('requestfailed', r => errors.push(`missing: ${r.url()}`));
// The PDF uses the lighter JPEG copies of the screenshots (tools/optimize-images.py) when they exist;
// source/guide.html itself keeps pointing at the full-size PNGs.
const lighter = path.join(root, 'build', 'img');
if (fs.existsSync(lighter)) {
  await page.route(/\/screenshots\/[^/]+\.png$/, route => {
    const jpg = path.join(lighter, path.basename(new URL(route.request().url()).pathname, '.png') + '.jpg');
    if (fs.existsSync(jpg)) route.fulfill({ body: fs.readFileSync(jpg), contentType: 'image/jpeg' });
    else route.continue();
  });
}
await page.goto(pathToFileURL(html).href, { waitUntil: 'load' });
await page.emulateMedia({ media: 'print' });
await page.evaluate(async () => {
  await document.fonts.ready;
  await Promise.all(Array.from(document.images).map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })));
});
const broken = await page.evaluate(() => Array.from(document.images).filter(i => !i.naturalWidth).map(i => i.getAttribute('src')));
const overflow = await page.evaluate(() => window.__checkPages());
const pages = await page.evaluate(() => document.querySelectorAll('.page').length);
if (errors.length || broken.length) console.log('Problems:\n  ' + [...errors, ...broken.map(b => `image not loaded: ${b}`)].join('\n  '));
if (overflow.length) {
  console.log(`Content does not fit on ${overflow.length} page(s):`);
  for (const o of overflow) console.log(`  page ${o.page}: ${o.by > 0 ? `${o.by}px too tall` : ''}${o.sideways ? ' too wide' : ''}`);
}
if ((overflow.length || broken.length) && !process.argv.includes('--force')) {
  await browser.close();
  process.exit(1);
}
await page.pdf({ path: out, printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log(`${path.relative(process.cwd(), out)}: ${pages} pages`);
