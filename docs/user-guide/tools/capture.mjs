// ============================================================
// Screenshot capture for the DT POS Enterprise User Guide.
//
// Every picture in the guide is taken here, from the running software:
//   1. start the screenshot servers (see README.md):
//        npx vite --config docs/user-guide/tools/vite.docs.config.mjs --port 5201
//        DOCS_REAL_GATE=1 npx vite --config docs/user-guide/tools/vite.docs.config.mjs --port 5202
//   2. node docs/user-guide/tools/capture.mjs            (all shots)
//      node docs/user-guide/tools/capture.mjs pos- day-  (only ids starting with these)
//
// Output: docs/user-guide/screenshots/<id>.png and manifest.json (size of each
// picture and the numbered markers drawn over it in the guide).
// The data shown is the sample restaurant from demo-data.mjs.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDemo } from './demo-data.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../screenshots');
const PW = process.env.PLAYWRIGHT_CORE || '/opt/node-tools/node_modules/playwright-core/index.mjs';
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const APP = process.env.DOCS_APP_URL || 'http://127.0.0.1:5201';
const GATE = process.env.DOCS_GATE_URL || 'http://127.0.0.1:5202';
const DSF = Number(process.env.DOCS_DSF || 1.5);
const only = process.argv.slice(2);

let chromium;
try { ({ chromium } = await import('playwright-core')); } catch { ({ chromium } = await import(PW)); }
fs.mkdirSync(OUT, { recursive: true });
const manifestPath = path.join(OUT, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--font-render-hinting=none'] });
const failures = [];

// ---------------------------------------------------------------- helpers
async function open({ route = '/', theme = 'dtr-royal', style = 'modern', role = 'admin', w = 1440, h = 900, ls = {}, mutate, splash = false, url = APP, loggedIn = true, wait = 1600 } = {}) {
  const demo = buildDemo();
  if (mutate) mutate(demo);
  const extra = demo.__extraStorage || {};
  delete demo.__extraStorage;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: DSF });
  await ctx.addInitScript(({ demo, extra, theme, style, role, ls, splash, loggedIn }) => {
    try {
      window.print = () => { setTimeout(() => window.dispatchEvent(new Event('afterprint')), 30); };
      if (!localStorage.getItem('__seeded')) {
        localStorage.setItem('desi-pos-data', demo);
        for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, JSON.stringify(v));
        if (loggedIn) {
          const id = role === 'admin' ? 'admin-default' : role === 'manager' ? 'u-manager' : 'u-cashier';
          localStorage.setItem('pos-user-id', id); localStorage.setItem('pos-user-role', role);
        }
        localStorage.setItem('dtpos-ui-style', style);
        if (theme) localStorage.setItem('dtpos-ui-theme', theme);
        localStorage.setItem('pos-location-decided', 'skipped');
        for (const [k, v] of Object.entries(ls)) { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
        localStorage.setItem('__seeded', '1');
      }
      if (!splash) sessionStorage.setItem('pos-splash-seen', '1');
    } catch { /* storage blocked */ }
  }, { demo: JSON.stringify(demo), extra, theme, style, role, ls, splash, loggedIn });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e).slice(0, 200)));
  await page.goto(`${url}/#${route}`);
  await page.waitForTimeout(wait);
  return { ctx, page };
}

/**
 * The guide shows no food pictures and no location pop-ups:
 *  - food emoji (🍳 🍔 🥤 🫓 …) are taken out of the text of the page,
 *  - the "GPS Location / Share Location" box in the delivery form is removed,
 *  - the one-time "Allow Location" question never appears (see open()).
 * Nothing else on the screen is touched.
 */
async function cleanForGuide(page) {
  await page.evaluate(() => {
    const FOOD = /[\u{1F32D}-\u{1F37F}\u{1F950}-\u{1F9AF}\u{1FAD0}-\u{1FAD9}\u2615]\uFE0F?\s?/gu;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) { if (FOOD.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(FOOD, ''); FOOD.lastIndex = 0; }
    document.querySelectorAll('[placeholder]').forEach(el => { const v = el.getAttribute('placeholder'); if (FOOD.test(v)) el.setAttribute('placeholder', v.replace(FOOD, '')); FOOD.lastIndex = 0; });
    // location box in the delivery form
    document.querySelectorAll('div').forEach(d => {
      if (d.children.length && /GPS Location/.test(d.textContent || '') && /Share Location|Update/.test(d.textContent || '') && d.className.includes('border') && d.className.includes('rounded-lg') && (d.textContent || '').length < 200) d.remove();
    });
  });
}

/** Pick the order type on the POS gate (if it is showing). */
async function gate(page, label = 'Takeaway') {
  const b = page.getByRole('dialog').getByRole('button', { name: new RegExp(label) });
  if (await b.first().isVisible().catch(() => false)) { await b.first().click(); await page.waitForTimeout(350); }
}
const tap = async (page, text, opts = {}) => { await page.getByText(text, { exact: true, ...opts }).first().click(); await page.waitForTimeout(250); };

/**
 * Save a screenshot. clip: a selector (or a function returning a box) to crop to.
 * markers: [{ n, sel, at? }] → numbered circles drawn by the guide at that element
 * (at: 'center' | 'left' | 'right' | 'top' | 'bottom' | 'tl' | 'tr').
 */
async function save(page, id, { clip, pad = 14, markers = [], fullPage = false, title, keepToasts = false } = {}) {
  let box = null;
  await page.waitForTimeout(450); // let dialogs finish opening before measuring them
  if (clip === 'main') {
    // the page without the left menu (shown once in the Workspace chapter), so the module reads larger
    const vw = page.viewportSize().width, vh = page.viewportSize().height;
    const sb = await page.locator('[data-ui-shell="sidebar"]').first().boundingBox().catch(() => null);
    const x = sb && sb.width < vw / 2 ? Math.round(sb.x + sb.width) : 0;
    clip = async () => ({ x, y: 0, width: vw - x, height: vh });
    pad = 0;
  } else if (clip === 'panel') {
    // a Settings tab: its own panel, cut at the bottom of the window
    clip = async (p) => {
      const b = await p.locator('[role="tabpanel"][data-state="active"]').first().boundingBox();
      const vh = p.viewportSize().height;
      if (!b) return null;
      const hdr = await p.locator('[data-ui-shell="header"]').first().boundingBox().catch(() => null);
      const top = Math.max(b.y, hdr ? hdr.y + hdr.height + 8 : 0), bottom = Math.min(b.y + b.height, vh - 4);
      return { x: b.x, y: top, width: b.width, height: bottom - top };
    };
  }
  if (clip) {
    const el = typeof clip === 'string' ? (clip === '[role="dialog"]' ? page.locator(clip).last() : page.locator(clip).first()) : null;
    const b = el ? await el.boundingBox() : await clip(page);
    if (!b) throw new Error(`clip not found: ${clip}`);
    const vw = page.viewportSize().width, vh = page.viewportSize().height;
    const x = Math.max(0, b.x - pad), y = Math.max(0, b.y - pad);
    box = { x, y, width: Math.min(vw - x, b.width + pad * 2), height: Math.min(vh - y, b.height + pad * 2) };
  }
  if (!keepToasts) await page.addStyleTag({ content: '[data-sonner-toaster]{display:none!important}' }).catch(() => {});
  await cleanForGuide(page);
  await page.waitForTimeout(200);
  const file = `${id}.png`;
  await page.screenshot({ path: path.join(OUT, file), ...(box ? { clip: box } : {}), fullPage });
  const frame = box || { x: 0, y: 0, ...page.viewportSize() };
  const pts = [];
  for (const m of markers) {
    const loc = typeof m.sel === 'string' ? page.locator(m.sel).first() : m.sel;
    const b = await loc.boundingBox().catch(() => null);
    if (!b) { failures.push(`${id}: marker ${m.n} not found (${m.sel})`); continue; }
    const at = m.at || 'tl';
    const px = at.includes('l') && at !== 'tl' ? b.x : at === 'tl' ? b.x + 6 : at.includes('r') ? b.x + b.width - 6 : b.x + b.width / 2;
    const py = at === 'tl' || at === 'tr' || at === 'top' ? b.y + 6 : at === 'bottom' ? b.y + b.height - 6 : b.y + b.height / 2;
    pts.push({ n: m.n, x: +(((px - frame.x) / frame.width) * 100).toFixed(2), y: +(((py - frame.y) / frame.height) * 100).toFixed(2) });
  }
  manifest[id] = { file, w: Math.round(frame.width), h: Math.round(frame.height), markers: pts, ...(title ? { title } : {}) };
  if (page.errors.length) failures.push(`${id}: page errors: ${page.errors.join(' | ')}`);
  console.log(`✓ ${id} (${Math.round(frame.width)}×${Math.round(frame.height)})${pts.length ? ` · ${pts.length} markers` : ''}`);
}

const shots = [];
const def = (id, fn) => shots.push({ id, fn });

// ================================================================ 1. Getting started
def('start-splash', async () => {
  const { ctx, page } = await open({ splash: true, wait: 1500 });
  await save(page, 'start-splash'); await ctx.close();
});
def('start-activation', async () => {
  const { ctx, page } = await open({ url: GATE, loggedIn: false, wait: 2500 });
  await save(page, 'start-activation'); await ctx.close();
});
def('start-login', async () => {
  const { ctx, page } = await open({ loggedIn: false, ls: { 'pos-login-mode': 'password' } });
  await save(page, 'start-login', { markers: [
    { n: 1, sel: 'input[placeholder="Enter your username"]', at: 'right' },
    { n: 2, sel: 'input[placeholder="Enter your password"]', at: 'right' },
    { n: 3, sel: 'button:has-text("Sign In")', at: 'right' },
    { n: 4, sel: '[data-use-pin]', at: 'right' },
    { n: 5, sel: 'button:has-text("Contact Admin")', at: 'right' },
  ] });
  await ctx.close();
});
def('start-login-pin', async () => {
  const { ctx, page } = await open({ loggedIn: false, ls: { 'pos-login-mode': 'pin' } });
  await page.locator('[data-pin-user="admin-default"]').click();
  await page.keyboard.type('12'); await page.waitForTimeout(200);
  await save(page, 'start-login-pin', { clip: '.dtr-login-form', pad: 20 }); await ctx.close();
});
def('start-login-espresso', async () => {
  const { ctx, page } = await open({ loggedIn: false, theme: 'dtr-espresso' });
  await save(page, 'start-login-espresso'); await ctx.close();
});
def('start-contact', async () => {
  const { ctx, page } = await open({ loggedIn: false, ls: { 'pos-login-mode': 'password' } });
  await page.getByRole('button', { name: 'Contact Admin' }).click(); await page.waitForTimeout(500);
  await save(page, 'start-contact', { clip: '[role="dialog"]', pad: 18 }); await ctx.close();
});

// ================================================================ 2. Workspace
def('ws-dashboard-shell', async () => {
  const { ctx, page } = await open({ route: '/dashboard' });
  await save(page, 'ws-dashboard-shell', { markers: [
    { n: 1, sel: '[data-ui-shell="sidebar"]', at: 'tr' },
    { n: 2, sel: '[data-ui-shell="header"] h1', at: 'right' },
    { n: 3, sel: '[data-dtr="search-icon"]', at: 'center' },
    { n: 4, sel: '[data-ui-shell="header"] .ml-auto > div:first-child', at: 'left' },
    { n: 5, sel: '[data-dtr="user-chip"]', at: 'left' },
    { n: 6, sel: '[data-dtr="powered"]', at: 'tr' },
  ] });
  await ctx.close();
});
def('ws-launcher', async () => {
  const { ctx, page } = await open({ route: '/dashboard' });
  await page.locator('[data-dtr="search-icon"]').click(); await page.waitForTimeout(500);
  await save(page, 'ws-launcher', { clip: '[role="dialog"]', pad: 18 }); await ctx.close();
});
def('ws-more-menu', async () => {
  const { ctx, page } = await open({ route: '/dashboard' });
  const more = page.locator('[data-ui-shell="sidebar"]').getByText('More', { exact: true });
  await more.click(); await page.waitForTimeout(500);
  await save(page, 'ws-more-menu'); await ctx.close();
});

// ================================================================ 3. POS
const fillCart = async (page) => {
  await tap(page, 'Zinger Burger');
  await tap(page, 'Zinger Burger');
  await tap(page, 'Masala Fries');
  await tap(page, 'Mint Margarita');
  await tap(page, 'Chicken Fajita Pizza');
  await page.getByRole('dialog').getByText('Medium', { exact: false }).first().click(); await page.waitForTimeout(300);
};
def('pos-gate', async () => {
  const { ctx, page } = await open({ route: '/' });
  await save(page, 'pos-gate', { clip: '[role="dialog"]', pad: 18 }); await ctx.close();
});
def('pos-main', async () => {
  const { ctx, page } = await open({ route: '/' });
  await gate(page, 'Takeaway');
  await fillCart(page);
  await save(page, 'pos-main', { markers: [
    { n: 1, sel: '#pos-search', at: 'left' },
    { n: 2, sel: '[data-pos-categories]', at: 'tl' },
    { n: 3, sel: '[data-pos-card]', at: 'tl' },
    { n: 4, sel: '[data-pos-cart] >> text=Takeaway', at: 'left' },
    { n: 5, sel: '[data-pos-lines]', at: 'tl' },
    { n: 6, sel: '[data-pos-totals]', at: 'tl' },
    { n: 7, sel: '[data-pos-pay]', at: 'left' },
    { n: 8, sel: '[data-pos-actions-secondary]', at: 'left' },
  ] });
  await ctx.close();
});
def('pos-cart', async () => {
  const { ctx, page } = await open({ route: '/' });
  await gate(page, 'Takeaway');
  await fillCart(page);
  await save(page, 'pos-cart', { clip: '[data-pos-cart]', pad: 0, markers: [
    { n: 1, sel: '[data-pos-ordertype]', at: 'left' },
    { n: 2, sel: '[data-pos-cust]', at: 'left' },
    { n: 3, sel: '[data-pos-lines]', at: 'tl' },
    { n: 4, sel: '[data-pos-totals]', at: 'tl' },
    { n: 5, sel: 'button:has-text("Hold")', at: 'left' },
    { n: 6, sel: '[data-pos-pay]', at: 'left' },
    { n: 7, sel: '[data-pos-actions-secondary]', at: 'left' },
    { n: 8, sel: 'button:has-text("Running")', at: 'left' },
    { n: 9, sel: 'button[aria-label="More actions"]', at: 'center' },
  ] });
  await ctx.close();
});
def('pos-variant', async () => {
  const { ctx, page } = await open({ route: '/' });
  await gate(page, 'Takeaway');
  await tap(page, 'Pepperoni Feast');
  await save(page, 'pos-variant', { clip: '[role="dialog"]', pad: 18 }); await ctx.close();
});
def('pos-weight', async () => {
  const { ctx, page } = await open({ route: '/' });
  await gate(page, 'Takeaway');
  await tap(page, 'Mutton Karahi (per kg)');
  await page.locator('[data-weight-preset="1.5"]').click(); await page.waitForTimeout(400);
  await save(page, 'pos-weight'); await ctx.close();
});
def('pos-category-grid', async () => {
  const { ctx, page } = await open({ route: '/' });
  await gate(page, 'Takeaway');
  await page.locator('[data-pos-cat-grid]').first().click(); await page.waitForTimeout(500);
  await save(page, 'pos-category-grid', { clip: '[role="dialog"]', pad: 18 }); await ctx.close();
});
def('pos-dining-dialog', async () => {
  const { ctx, page } = await open({ route: '/' });
  await page.getByRole('dialog').getByRole('button', { name: /Dine-In/ }).click(); await page.waitForTimeout(300);
  await tap(page, 'Chicken Karahi Half');
  await page.getByRole('button', { name: /Running/ }).first().click(); await page.waitForTimeout(600);
  await save(page, 'pos-dining-dialog', { clip: '[role="dialog"]', pad: 18 }); await ctx.close();
});
def('pos-delivery-dialog', async () => {
  const { ctx, page } = await open({ route: '/' });
  await page.getByRole('dialog').getByRole('button', { name: /Delivery/ }).click(); await page.waitForTimeout(300);
  await tap(page, 'Zinger Burger');
  await page.getByRole('button', { name: /Running/ }).first().click(); await page.waitForTimeout(600);
  const name = page.getByRole('dialog').getByPlaceholder(/Customer Name/).first();
  await name.fill('Ahm'); await page.waitForTimeout(600);
  await save(page, 'pos-delivery-dialog', { clip: '[role="dialog"]', pad: 18 }); await ctx.close();
});
def('pos-payment', async () => {
  const { ctx, page } = await open({ route: '/' });
  await gate(page, 'Takeaway');
  await fillCart(page);
  await page.locator('[data-pos-pay]').click();
  await page.locator('[data-pay-premium]').waitFor({ timeout: 4000 }); await page.waitForTimeout(400);
  await page.locator('[data-pay-note="5000"]').click().catch(() => {});
  await page.waitForTimeout(300);
  await save(page, 'pos-payment', { clip: '[data-pay-premium]', pad: 18, markers: [
    { n: 1, sel: '[data-pay-total]', at: 'tr' },
    { n: 2, sel: '[data-pay-method]', at: 'tl' },
    { n: 3, sel: '[data-pay-print]', at: 'left' },
    { n: 4, sel: '[data-pay-amount]', at: 'right' },
    { n: 5, sel: '[data-pay-note]', at: 'tl' },
    { n: 6, sel: '[data-pay-change]', at: 'tl' },
    { n: 7, sel: '[data-pay-complete]', at: 'left' },
  ] });
  await ctx.close();
});
def('pos-receipt', async () => {
  const { ctx, page } = await open({ route: '/', ls: { 'dtpos-print-preview-enabled': '1' } });
  await gate(page, 'Takeaway');
  await fillCart(page);
  await page.locator('[data-pos-pay]').click();
  await page.locator('[data-pay-premium]').waitFor({ timeout: 4000 });
  await page.locator('[data-pay-note="5000"]').click().catch(() => {});
  await page.locator('[data-pay-complete]').click();
  await page.locator('.receipt-paper').first().waitFor({ timeout: 5000 }); await page.waitForTimeout(500);
  await save(page, 'pos-receipt', { clip: '[role="dialog"]', pad: 16 }); await ctx.close();
});
def('pos-kitchen-slip', async () => {
  const { ctx, page } = await open({ route: '/' });
  await gate(page, 'Takeaway');
  await fillCart(page);
  await page.locator('[data-pos-actions-secondary] button').first().click(); await page.waitForTimeout(1200);
  await save(page, 'pos-kitchen-slip', { clip: '[role="dialog"]', pad: 16 }); await ctx.close();
});
def('pos-more-menu', async () => {
  const { ctx, page } = await open({ route: '/' });
  await gate(page, 'Takeaway');
  await fillCart(page);
  await page.getByRole('button', { name: 'More actions' }).click(); await page.waitForTimeout(300);
  await save(page, 'pos-more-menu', { clip: '[data-pos-cart]', pad: 6 }); await ctx.close();
});
def('pos-credit', async () => {
  const { ctx, page } = await open({ route: '/' });
  await gate(page, 'Takeaway');
  await fillCart(page);
  await page.getByRole('button', { name: 'More actions' }).click(); await page.waitForTimeout(300);
  await page.getByText('Credit', { exact: false }).last().click(); await page.waitForTimeout(600);
  await save(page, 'pos-credit', { clip: '[role="dialog"]', pad: 18 }); await ctx.close();
});
def('pos-manual-item', async () => {
  const { ctx, page } = await open({ route: '/' });
  await gate(page, 'Takeaway');
  await page.getByRole('button', { name: /Manual/ }).first().click(); await page.waitForTimeout(500);
  await save(page, 'pos-manual-item', { clip: '[role="dialog"]', pad: 18 }); await ctx.close();
});


// Generic: a page as it opens (optionally a tab clicked, a crop, scrolled).
const page1 = (id, route, o = {}) => def(id, async () => {
  const { ctx, page } = await open({ route, ...(o.open || {}) });
  if (o.tab) { await page.getByRole('tab', { name: o.tab }).first().click(); await page.waitForTimeout(600); }
  if (o.click) { for (const t of [].concat(o.click)) { await page.getByText(t, { exact: true }).first().click(); await page.waitForTimeout(600); } }
  if (o.act) await o.act(page);
  if (o.scroll) { await page.evaluate((y) => { const m = document.querySelector('main'); if (m) m.scrollTo(0, y); }, o.scroll); await page.waitForTimeout(400); }
  await save(page, id, { clip: o.full ? undefined : (o.clip || 'main'), pad: o.pad ?? 14, markers: o.markers || [] });
  await ctx.close();
});
const dialogShot = (id, route, act, o = {}) => page1(id, route, { ...o, act, clip: o.clip || '[role="dialog"]', pad: 18 });

// ================================================================ 4. Tables & dine-in
page1('tables-grid', '/tables', { markers: [
  { n: 1, sel: 'button:has-text("Grid")', at: 'left' },
  { n: 2, sel: 'button:has-text("All Floors")', at: 'left' },
  { n: 3, sel: 'button:has-text("All Table QRs")', at: 'left' },
] });
page1('tables-floormap', '/tables', { click: 'Floor Map' });
dialogShot('tables-running-dialog', '/tables', async (page) => { await page.getByText('T-2', { exact: true }).first().click(); await page.waitForTimeout(600); });
dialogShot('tables-free-dialog', '/tables', async (page) => { await page.getByText('T-1', { exact: true }).first().click(); await page.waitForTimeout(600); });
dialogShot('tables-qr', '/tables', async (page) => { await page.getByRole('button', { name: /All Table QRs/ }).click(); await page.waitForTimeout(900); });
page1('bills-retrieve', '/bills');
page1('bills-retray', '/retray');

// ================================================================ 5. Kitchen & displays
page1('kitchen-display', '/kitchen');
page1('kitchen-tv', '/kds-tv', { full: true });
page1('display-customer', '/customer-display', { full: true });
page1('kitchen-display-center', '/kitchen', { open: { h: 1100 }, act: async (page) => { await page.getByRole('button', { name: /TV Mode/ }).click(); await page.waitForTimeout(800); } });

// ================================================================ 6. Delivery & pickup
page1('delivery-board', '/delivery');
page1('pickup-orders', '/pickup');
page1('foodpanda-orders', '/foodpanda-orders');

// ================================================================ 7. Payments, credit, corrections
page1('pay-pending', '/pending-payments');
page1('credit-list', '/credits');
page1('credit-ledger', '/credit-customers');
page1('void-bills', '/void-bills');
page1('bill-reprint', '/bill-reprint');
page1('bill-editor', '/bill-editor', { act: async (page) => { await page.getByText('#' , { exact: false }).first(); const first = page.locator('text=/^#\\d+$/').first(); await first.click().catch(() => {}); await page.waitForTimeout(700); } });
page1('audit-history', '/audit-history');

// ================================================================ 8. Menu & stock
page1('menu-manager', '/menu', { markers: [
  { n: 1, sel: 'button:has-text("Category")', at: 'left' },
  { n: 2, sel: 'button:has-text("Item")', at: 'left' },
  { n: 3, sel: 'button:has-text("Import Excel/CSV")', at: 'left' },
  { n: 4, sel: 'button:has-text("Bulk Upload Images")', at: 'left' },
  { n: 5, sel: 'button:has-text("Recycle Bin")', at: 'left' },
] });
dialogShot('menu-item-dialog', '/menu', async (page) => { await page.locator('tr', { hasText: 'Chicken Fajita Pizza' }).locator('td:last-child button').first().click(); await page.waitForTimeout(700); });
dialogShot('menu-import', '/menu', async (page) => { await page.getByRole('button', { name: /Import Excel\/CSV/ }).click(); await page.waitForTimeout(700); });
page1('menu-deals', '/variations');
page1('stock-inventory', '/inventory');
dialogShot('stock-in-dialog', '/inventory', async (page) => { await page.locator('tr', { hasText: 'Basmati Rice' }).getByRole('button', { name: /^In$/ }).first().click(); await page.waitForTimeout(700); });
page1('stock-recipes', '/recipes');
dialogShot('stock-recipe-dialog', '/recipes', async (page) => { await page.locator('tr', { hasText: 'Beef Smash Burger' }).getByRole('button', { name: /Edit/ }).first().click(); await page.waitForTimeout(800); });
page1('stock-receiving', '/receiving');
dialogShot('stock-receiving-new', '/receiving', async (page) => { await page.getByRole('button', { name: /New Entry/ }).click(); await page.waitForTimeout(700); });
page1('stock-wastage', '/wastage');

// ================================================================ 9. Customers & marketing
page1('cust-database', '/customers');
dialogShot('cust-view', '/customers', async (page) => { await page.getByRole('button', { name: /View/ }).first().click(); await page.waitForTimeout(800); });
page1('cust-top', '/customers', { tab: /Top Customers/ });
page1('cust-crm', '/crm');
page1('cust-contacts', '/marketing');
page1('cust-promo', '/promo-codes');
dialogShot('cust-promo-new', '/promo-codes', async (page) => { await page.getByRole('button', { name: /New Promo/ }).click(); await page.waitForTimeout(700); });
page1('cust-whatsapp', '/whatsapp');

// ================================================================ 10. Accounts & staff
page1('acc-overview', '/accounts');
page1('acc-payment-accounts', '/accounts', { tab: /Payment A\/Cs/ });
page1('acc-expense', '/accounts', { tab: /Expense/ });
page1('acc-cash-close', '/accounts', { tab: /Cash Close/ });
page1('acc-parties', '/parties');
page1('acc-wages', '/daily-wages');
page1('acc-wages-ledger', '/daily-wages', { tab: /Worker Ledger/ });
page1('staff-hr', '/hr');
page1('staff-attendance', '/hr', { tab: /Attendance/ });
page1('staff-payslips', '/hr', { tab: /Payslips/ });
page1('staff-waiters', '/staff');
page1('staff-users', '/users');
dialogShot('staff-user-edit', '/users', async (page) => { await page.locator('tr', { hasText: 'Bilal (Cashier)' }).locator('button').first().click(); await page.waitForTimeout(800); });

// ================================================================ 11. Reports
page1('rep-dashboard', '/dashboard', { markers: [
  { n: 1, sel: '[data-dtr="hero"]', at: 'tl' },
  { n: 2, sel: 'select, [role="combobox"]', at: 'left' },
  { n: 3, sel: 'button:has-text("7 days")', at: 'top' },
  { n: 4, sel: '[data-stat-card]', at: 'tl' },
] });
page1('rep-dashboard-2', '/dashboard', { scroll: 640 });
page1('rep-reports', '/reports', { open: { w: 1440, h: 900 } });
page1('rep-reports-2', '/reports', { scroll: 700 });
page1('rep-reports-category', '/reports', { click: 'Category & Product wise' });
page1('rep-center', '/reports-center');
page1('rep-center-accounts', '/reports-center', { tab: /Payments by Account/ });
page1('rep-center-kot', '/reports-center', { tab: /Kitchen KOT Reports/ });
page1('rep-sales', '/sales-report');
page1('rep-advanced', '/advanced-reports');
page1('rep-admin-history', '/admin-sales-history');
page1('rep-profitability', '/profitability');
page1('rep-costing', '/costing');
page1('rep-tokens', '/token-module');

// ================================================================ 12. Day close & backup
page1('close-day', '/day-close');
page1('close-day-2', '/day-close', { scroll: 600 });
page1('close-backup', '/backup');

// ================================================================ 13. Settings
const settingsTab = (id, name, o = {}) => page1(id, '/settings', { clip: 'panel', pad: 10, open: { h: 1000 }, ...o, act: async (page) => {
  await page.getByRole('tab', { name }).first().click(); await page.waitForTimeout(700);
  if (o.then) await o.then(page);
} });
settingsTab('set-general', /^General$/);
settingsTab('set-general-2', /^General$/, { scroll: 900 });
settingsTab('set-appearance', /Appearance/);
settingsTab('set-appearance-retail', /Appearance/, { then: async (page) => { await page.getByRole('tab', { name: /DT Retail/ }).first().click(); await page.waitForTimeout(600); } });
settingsTab('set-modules', /Modules/);
settingsTab('set-screen', /Screen & Layout/);
settingsTab('set-tables', /^Tables$/);
settingsTab('set-waiters', /^Waiters$/);
settingsTab('set-pickup', /Self-Pickup/);
settingsTab('set-printer', /^Printer$/);
settingsTab('set-receipt', /Receipt & QR/);
settingsTab('set-receipt-fonts', /Receipt Fonts/);
settingsTab('set-kot', /KOT Settings/);
settingsTab('set-whatsapp', /WhatsApp/);
settingsTab('set-cities', /^Cities$/);
settingsTab('set-service-areas', /Service Areas/);
settingsTab('set-display', /^Display$/);

// Printer Center (its own module) — one picture per section
const printerSection = (id, label) => page1(id, '/printer-settings', { act: async (page) => {
  if (label) { await page.getByRole('button', { name: label }).first().click(); await page.waitForTimeout(700); }
} });
printerSection('prn-status', null);
printerSection('prn-printers', /^Printers$/);
printerSection('prn-roles', /Role mapping/);
printerSection('prn-mode', /Print mode/);
printerSection('prn-design', /Receipt design/);
printerSection('prn-margins', /^Margins$/);
printerSection('prn-quality', /Print quality/);
printerSection('prn-calibration', /Calibration/);
printerSection('prn-test', /Test print/);
printerSection('prn-tokens', /^Tokens$/);
printerSection('prn-alignment', /Alignment test/);
printerSection('prn-setup', /Diagnostics & setup/);
page1('prn-diagnostics', '/printer-diagnostics');


// ================================================================ 14. Looks, roles
page1('look-classic-pos', '/', { full: true, open: { style: 'classic', theme: null }, act: async (page) => { await gate(page, 'Takeaway'); await fillCart(page); } });
page1('look-espresso-pos', '/', { full: true, open: { theme: 'dtr-espresso' }, act: async (page) => { await gate(page, 'Takeaway'); await fillCart(page); } });
page1('look-night-dashboard', '/dashboard', { full: true, open: { theme: 'dtr-night' } });
page1('look-ember-dashboard', '/dashboard', { full: true, open: { theme: 'ember' } });
page1('role-cashier-pos', '/', { full: true, open: { role: 'cashier' }, act: async (page) => { await gate(page, 'Takeaway'); } });
page1('close-reset-sale', '/day-close', { act: async (page) => { await page.getByText('Reset Sale', { exact: true }).first().click(); await page.waitForTimeout(700); } });
// ================================================================ run
const todo = shots.filter(s => !only.length || only.some(p => s.id.startsWith(p)));
for (const s of todo) {
  try { await s.fn(); } catch (e) { failures.push(`${s.id}: ${String(e.message || e).split('\n')[0]}`); console.log(`✗ ${s.id}: ${String(e.message || e).split('\n')[0]}`); }
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
await browser.close();
console.log(`\n${todo.length - failures.filter(f => !f.includes('marker')).length}/${todo.length} shots; ${failures.length} notes`);
for (const f of failures) console.log('  - ' + f);
