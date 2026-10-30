// ============================================================
// Theme screenshots for docs/DESIGN_UI_A_TO_Z.md
//
//   1. start the docs dev server (see docs/user-guide/README.md):
//        npx vite --config docs/user-guide/tools/vite.docs.config.mjs --port 5201
//   2. node docs/design-gallery/tools/capture-themes.mjs
//
// For every built-in theme (13 Modern + 8 DT Retail) it takes the POS screen with a
// bill in the cart, and — for the DT Retail themes — the Dashboard (greeting banner),
// plus Classic. The data is the fictional "Sample Restaurant" of the User Guide.
// Output: docs/design-gallery/themes/<theme-id>-pos.png (and -dashboard.png).
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDemo } from '../../user-guide/tools/demo-data.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../themes');
const PW = process.env.PLAYWRIGHT_CORE || '/opt/node-tools/node_modules/playwright-core/index.mjs';
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const APP = process.env.DOCS_APP_URL || 'http://127.0.0.1:5201';
const { chromium } = await import(PW);
fs.mkdirSync(OUT, { recursive: true });

const MODERN = ['ember', 'tomato', 'pizza', 'fresh', 'sunny', 'white', 'ocean', 'coffee', 'rose', 'violet', 'teal', 'charcoal', 'navy'];
const RETAIL = ['dtr-royal', 'dtr-crimson', 'dtr-gold', 'dtr-emerald', 'dtr-sunset', 'dtr-ocean', 'dtr-night', 'dtr-espresso'];

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--font-render-hinting=none'] });

async function shoot(id, route, { style = 'modern', theme, cart = false, name }) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(({ demo, style, theme }) => {
    try {
      window.print = () => {};
      if (!localStorage.getItem('__seeded')) {
        localStorage.setItem('desi-pos-data', demo);
        localStorage.setItem('pos-user-id', 'admin-default'); localStorage.setItem('pos-user-role', 'admin');
        localStorage.setItem('dtpos-ui-style', style);
        if (theme) localStorage.setItem('dtpos-ui-theme', theme);
        localStorage.setItem('pos-location-decided', 'skipped');
        localStorage.setItem('__seeded', '1');
      }
      sessionStorage.setItem('pos-splash-seen', '1');
    } catch { /* storage blocked */ }
  }, { demo: JSON.stringify(buildDemo()), style, theme });
  const page = await ctx.newPage();
  await page.goto(`${APP}/#${route}`);
  await page.waitForTimeout(1500);
  if (cart) {
    const gate = page.getByRole('dialog').getByRole('button', { name: /Takeaway/ });
    if (await gate.first().isVisible().catch(() => false)) { await gate.first().click(); await page.waitForTimeout(350); }
    for (const t of ['Zinger Burger', 'Zinger Burger', 'Masala Fries', 'Mint Margarita']) {
      await page.getByText(t, { exact: true }).first().click(); await page.waitForTimeout(220);
    }
  }
  await page.addStyleTag({ content: '[data-sonner-toaster]{display:none!important}' }).catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  await ctx.close();
  console.log('✓', name);
}

await shoot('classic', '/', { style: 'classic', cart: true, name: 'classic-pos' });
for (const t of MODERN) await shoot(t, '/', { theme: t, cart: true, name: `${t}-pos` });
for (const t of RETAIL) {
  await shoot(t, '/', { theme: t, cart: true, name: `${t}-pos` });
  await shoot(t, '/dashboard', { theme: t, name: `${t}-dashboard` });
}
await browser.close();
