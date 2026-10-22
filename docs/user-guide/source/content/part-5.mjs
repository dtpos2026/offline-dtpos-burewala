// Chapters 18–21: Settings, Printer Center, Feature status, Appendix.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- Appendix A is generated from the software's own permission list (src/lib/permissions.ts).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const perm = fs.readFileSync(path.join(repo, 'src/lib/permissions.ts'), 'utf8');
const hiddenOffline = (perm.match(/OFFLINE_HIDDEN_KEYS = \[([\s\S]*?)\];/)[1].match(/'([^']+)'/g) || []).map(s => s.slice(1, -1));
const PAGES = [...perm.matchAll(/\{ key: '([^']+)',\s*path: '([^']+)',\s*title: '([^']+)',\s*group: '([^']+)',\s*defaultRoles: \[([^\]]*)\] \}/g)]
  .map(m => ({ key: m[1], path: m[2], title: m[3], group: m[4], roles: (m[5].match(/'([^']+)'/g) || []).map(s => s.slice(1, -1)) }));
if (PAGES.length < 50) throw new Error(`permissions.ts parse found only ${PAGES.length} pages`);
const ORDER_TAKER = ['pos', 'tables', 'bills'];
const offlinePages = PAGES.filter(p => !hiddenOffline.includes(p.key));
const tick = (on) => on ? '<span class="yes">●</span>' : '<span class="no">–</span>';
const roleRow = (p) => `<tr><td>${p.title.replace(/&/g, '&amp;')}</td><td class="c">${tick(true)}</td><td class="c">${tick(p.roles.includes('manager'))}</td><td class="c">${tick(p.roles.includes('cashier'))}</td><td class="c">${tick(ORDER_TAKER.includes(p.key))}</td></tr>`;
const half = Math.ceil(offlinePages.length / 2);
const roleTable = (rows) => `<table class="t compact"><thead><tr><th>Page</th><th class="c">Admin</th><th class="c">Manager</th><th class="c">Cashier</th><th class="c">Order taker</th></tr></thead><tbody>${rows.map(roleRow).join('')}</tbody></table>`;

export default [
  // ============================================================ 18
  {
    n: 18, title: 'Settings', thumb: 'set-general',
    intro: 'Everything the administrator configures: restaurant details, charges and tax, looks and layout, tables, printing, the kitchen ticket, WhatsApp and the customer display.',
    pages: [
      {
        num: '18.1', kicker: 'Settings', title: 'General — restaurant, currency and tax', shot: 'set-general', figW: 120,
        lead: 'The details printed on every bill, and the money settings behind every total. Settings are open to administrators.',
        html: `
<h4>How Settings is laid out</h4>
<p>The left column lists the tabs in groups — <b>General</b>, <b>Operations</b>, <b>Printing</b>, <b>Integrations</b>, <b>Advanced</b>. Change a value and press the <b>Save</b> button at the bottom of the tab (e.g. <i>Save Settings</i>, <i>Save Display Settings</i>). The <b>Data security &amp; isolation</b> strip at the top confirms the local data is encrypted and kept separate per restaurant.</p>
<h4>Country, currency &amp; tax</h4>
<p>Pick the country to fill in the currency symbol and ISO code. The <b>Tax %</b> beside it is a reference value for that country; it is <i>not</i> added to bills — bills use <b>GST / VAT %</b> (next page).</p>
<h4>Restaurant</h4>
<p><b>Restaurant name</b>, <b>address</b>, optional <b>website</b>, <b>Phone 1</b> and <b>Phone 2</b> — printed in the receipt header and on reports.</p>
<p><b>Tax amount (PKR)</b> — an optional fixed tax per bill (used only when GST % is 0).</p>
<h4>Service charge</h4>
<p>Charge as a <b>percentage</b> or a <b>fixed amount</b>, the value, and the order types it applies to (continued on the next page).</p>`,
      },
      {
        num: '18.2', kicker: 'Settings', title: 'General — charges, discounts, weight items and payment', shot: 'set-general-2', figW: 120,
        lead: 'Further down the General tab.',
        html: `
<ul class="dots">
<li><b>Service charge — apply to</b> Dine-In, Takeaway and/or Delivery; <b>Allow adding or editing it on a bill</b>. A live example shows the effect.</li>
<li><b>Weight items (kg)</b> — the side panel on/off, and your kg and rupee preset buttons (4.5).</li>
<li><b>Payment screen</b> — <b>Premium</b> (default) or <b>Classic</b> (4.8).</li>
<li><b>GST / VAT %</b> and <b>GST mode</b> — exclusive (added on top) or inclusive (already in the price).</li>
<li><b>Quick discount presets</b> — the % and rupee buttons in the bill.</li>
<li><b>Payment screen quick amounts</b> — your own cash note buttons.</li>
<li><b>Delivery charge</b> (flat) and <b>cash rounding</b>.</li>
</ul>
<p>Lower still: the <b>event discount</b>, categories and items excluded from discounts, <b>cashier discount approval</b>, <b>Food Cost &amp; Profit Tracking</b>, the <b>loyalty program</b> (points per Rs 100, value of a point, minimum to redeem) and the logos.</p>`,
      },
      {
        num: '18.3', kicker: 'Settings', title: 'Appearance', shot: 'set-appearance', figW: 120,
        lead: 'How the software looks on this computer. Appearance never changes data, bills or printing.',
        html: `
<ol class="steps">
<li>Choose the <b>interface style</b>: <b>Modern</b> (recommended) or <b>Classic</b>.</li>
<li>In the <b>Theme manager</b>, pick a family — <b>Modern themes</b> (13), <b>DT Retail</b> (8) or <b>Custom</b> — then a theme. It applies at once.</li>
<li>DT Retail themes add a gradient menu, a dashboard banner and gentle motion; <b>Smooth animations</b> can be switched off for slower PCs.</li>
<li><b>Custom</b> lets you design your own theme (colours for the menu, page and buttons) and export or import it as a file.</li>
</ol>
<p>Each computer keeps its own look, so the counter and the manager's PC can differ. A one-click option returns to the previous look.</p>`,
      },
      {
        type: 'pair', num: '18.4', kicker: 'Settings', title: 'Modules, and the screen layout', figH: 96,
        items: [
          { shot: 'set-modules', figW: 118, caption: '<b>Modules</b> — what the menu shows.', html: `<p>For each module choose <b>Sidebar</b>, <b>More</b> or <b>Hidden</b>, change its order with the arrows, and star favourites. Nothing is deleted — hidden modules keep their data. <span class="ui">Restore default</span> undoes everything.</p>` },
          { shot: 'set-screen', figW: 130, caption: '<b>Screen &amp; Layout</b> — the POS on this monitor.', html: `<p>Shows this screen's resolution and scaling. Choose the layout mode, product columns and card size, cart width, category placement and width, spacing, the main menu on the POS and the keypad. Each option starts on <i>Automatic</i>. <span class="ui">Save for this screen</span> stores it for this monitor size only; the preview shows the result.</p>` },
        ],
      },
      {
        type: 'pair', num: '18.5', kicker: 'Settings', title: 'Tables, floors, kitchens and waiters', figH: 100,
        items: [
          { shot: 'set-tables', figW: 128, caption: '<b>Tables</b> — floors, kitchens and tables.', html: `<ul class="dots"><li><b>Floors / sections</b> — Ground, First Floor, Outdoor, Family Hall…</li><li><b>Kitchens / stations</b> — Main, BBQ, Beverages… Each menu item is routed to one (11.2).</li><li><b>Tables</b> — name, chairs, shape and floor. <span class="ui">Add Table</span> adds one.</li></ul>` },
          { shot: 'set-waiters', figW: 128, caption: '<b>Waiters</b> — the service staff list.', html: `<p><span class="ui">Add Waiter</span>, then the name and phone. Waiters are chosen when a table is seated. The same list, with order counts and an active switch, is under Staff (15.3).</p>` },
        ],
      },
      {
        num: '18.6', kicker: 'Settings', title: 'Self-pickup and order-type options', shot: 'set-pickup', figW: 124, oneCol: true,
        lead: 'What customers can choose, and the questions the POS asks when an order starts.',
        html: `
<ul class="dots">
<li><b>Enable Self-Pickup</b> — a pickup option for online customers.</li>
<li><b>"Select Order Type" prompt</b> — the question when the POS opens (4.1). Off: items can be added straight away.</li>
<li><b>Enable Foodpanda Mode</b> — the fourth order type (8.3).</li>
<li><b>Pickup time slots</b> — 15, 30, 45, 60, 90 or 120 minutes, as buttons the customer can choose.</li>
<li><b>"Order Ready" WhatsApp message</b> — the text sent to a customer when the pickup order is ready (8.2).</li>
</ul>
<p>Press <span class="ui">Save Pickup Settings</span> after any change.</p>`,
      },
      {
        num: '18.7', kicker: 'Settings', title: 'Printer', shot: 'set-printer', figW: 120,
        lead: 'The basic printer choices for this computer. The full Printer Center is described in chapter 19.',
        html: `
<ul class="dots">
<li><b>Default printer</b>, <b>Kitchen (KOT) printer</b> and an optional <b>Token printer</b> — chosen from the printers installed in Windows.</li>
<li><b>Backup printer &amp; failover</b> — <b>Auto Reprint on Failure</b> moves a job to the backup printer when the main one fails.</li>
<li><b>Offline Printer Alert</b> — a red banner while a printer is offline; jobs are held, not lost.</li>
<li><b>Silent Print</b> — the receipt goes straight to the printer, with no print dialog.</li>
<li>Paper size, cut and trim options, and a preset for the Fujitsu FP-1100.</li>
</ul>
<div class="note status"><b>Status.</b> Choosing printers by name and silent printing need the Windows desktop app. In a browser (as in this picture) the system print dialog is used.</div>`,
      },
      {
        type: 'pair', num: '18.8', kicker: 'Settings', title: 'Receipt design and receipt fonts', figH: 100,
        items: [
          { shot: 'set-receipt', figW: 128, caption: '<b>Receipt &amp; QR</b> — design gallery and QR options.', html: `<p>Pick the bill design — Standard (recommended), Compact Thermal, Classic, Modern Branded, Luxury VIP, Bistro Café and many more — and, further down, the QR code or barcode printed on the bill and what it holds. The same gallery, with a live preview, is in the Printer Center (19.5).</p>` },
          { shot: 'set-receipt-fonts', figW: 128, caption: '<b>Receipt Fonts</b> — per line.', html: `<p>For each part of the receipt — restaurant name, address, phone, order number, items, totals — choose the font, size (px), bold and alignment. Urdu fonts (Jameel Noori Nastaleeq and others) are available for Urdu names. <span class="ui">Reset</span> restores a line.</p>` },
        ],
      },
      {
        num: '18.9', kicker: 'Settings', title: 'KOT settings — the kitchen ticket', shot: 'set-kot', figW: 120,
        lead: 'When kitchen tickets and receipts print, what the KOT shows, and the kitchen timers.',
        html: `
<ul class="dots">
<li><b>Enable KOT Printing</b> and <b>Auto Print KOT on New Order</b>.</li>
<li><b>No Receipt on Pay</b> — no slip when a bill is paid. <b>Payment screen on Pay</b> — off pays in cash and prints at once.</li>
<li><b>Tandoor Token</b> and <b>Count token items in sales</b> (16.12).</li>
<li><b>Manual "Send to Kitchen" only</b>; <b>Auto Print Customer Receipt</b>; <b>Show bill on screen after payment</b>.</li>
<li><b>Order-type auto-KOT</b> — Dine-in, Takeaway and Delivery each on or off.</li>
<li><b>Print CANCEL KOT to Kitchen</b> — a cancel slip when an order is voided.</li>
<li>Printer type, number of KOT copies, auto-cut, printer by station, and the KOT <b>design</b> (Classic, Bold, Minimal, Elegant, VIP Chef, Station…) with what it shows.</li>
<li>Kitchen timer minutes and the <b>business day start</b> time.</li>
</ul>`,
      },
      {
        num: '18.10', kicker: 'Settings', title: 'WhatsApp', shot: 'set-whatsapp', figW: 120,
        lead: 'The WhatsApp button on the online order page and the message templates used across the POS.',
        html: `
<ul class="dots">
<li><b>WhatsApp Floating Button</b> — for the online order page (online edition), with the number and the default message.</li>
<li><b>Message templates</b> — <i>Paid / Bill Clear</i>, <i>Delivery Status</i> and your own. Choose the default paid and delivery templates; <span class="ui">Add Template</span> adds another.</li>
<li>Variables filled in automatically: <code>{customer_name}</code>, <code>{order_number}</code>, <code>{grand_total}</code>, <code>{restaurant_name}</code>, <code>{delivery_status_line}</code>, <code>{rider_block}</code>.</li>
</ul>
<p>Templates appear in the WhatsApp module (13.6) and on the delivery board (8.1).</p>`,
      },
      {
        type: 'pair', num: '18.11', kicker: 'Settings', title: 'Cities and delivery service areas', figH: 96,
        items: [
          { shot: 'set-cities', figW: 128, caption: '<b>Cities &amp; Areas</b> — by province.', html: `<p>Tick the cities you serve, or add a custom city. They appear in address forms and city lists.</p>` },
          { shot: 'set-service-areas', figW: 128, caption: '<b>Delivery Service Areas</b>', html: `<p>Add service cities, then the areas or neighbourhoods inside each, with an optional map link. They appear as choices in the delivery form, which keeps addresses consistent.</p>` },
        ],
      },
      {
        num: '18.12', kicker: 'Settings', title: 'Display — the customer screen', shot: 'set-display', figW: 120,
        lead: 'Switches on the Customer Display and decides what it shows.',
        html: `
<ol class="steps">
<li>Turn on <b>Enable Display Screen</b>.</li>
<li>Choose what to show: the order items live, a large total, full screen.</li>
<li>Add images for the slideshow shown when there is no order.</li>
<li>Press <span class="ui">Save Display Settings</span>, then open the display from the Kitchen screen's TV Mode (7.2).</li>
</ol>
<p>While the cashier rings up a bill, the customer sees "Your order" with the item names, quantities, amounts, discount, service charge and total — exactly as on the receipt. Nothing internal is shown: no cashier, waiter, rider, kitchen notes or customer phone.</p>`,
      },
    ],
  },

  // ============================================================ 19
  {
    n: 19, title: 'Printers and the Printer Center', thumb: 'prn-printers',
    intro: 'Setting up receipt, kitchen and token printers, which slip prints where, the receipt design, margins, print quality and the troubleshooting tools.',
    pages: [
      {
        num: '19.1', kicker: 'Printer Center', title: 'Status', shot: 'prn-status', figW: 166,
        lead: 'Is each printer reachable, and what has it printed lately? The Printer Center opens here.',
        html: `
<p>The Printer Center has one section per job, listed on its left: Status, Printers, Role mapping, Print mode &amp; speed, Receipt design, Margins, Alignment test, Print quality, Calibration, Test print, Diagnostics &amp; setup and Tokens.</p>
<ul class="dots">
<li><span class="ui">Re-detect</span> checks the printers again — after reconnecting one, for example.</li>
<li><span class="ui">Fix printer names</span> updates a printer whose Windows name changed — the most common cause of a blank receipt.</li>
<li><b>Print Preview before printing</b> — show the paid bill first; off is the fast silent print.</li>
<li><b>Auto retry on print failure</b> — 0 to 3 retries.</li>
</ul>`,
      },
      {
        num: '19.2', kicker: 'Printer Center', title: 'Printers and system readiness', shot: 'prn-printers', figW: 166,
        lead: 'The printers themselves — name, paper, connection and driver mode — and a readiness check.',
        html: `
<p>The <b>System Readiness Check</b> lists silent print, the kitchen, receipt and delivery printers, the last KOT and receipt printed and pending jobs, each with a status. <span class="ui">Verify Kitchen KOT</span>, <span class="ui">Verify Receipt</span> and <span class="ui">Verify Delivery</span> print a check slip.</p>
<p>Add each printer with its Windows name, paper width (80 / 58 mm) and mode.</p>
<p><b>Silent Print Server</b> — on one counter PC only, it prints every KOT and receipt from the queue automatically.</p>
<div class="note status"><b>Status.</b> Printer detection and silent printing need the Windows desktop app; in a browser, as here, the checks show <i>Browser mode</i>.</div>`,
      },
      {
        num: '19.3', kicker: 'Printer Center', title: 'Role mapping', shot: 'prn-roles', figW: 166,
        lead: 'Which printer each slip goes to. The print queue reads this when a bill is paid.',
        html: `
<ul class="dots">
<li><b>Customer bill</b> — the receipt at the counter.</li>
<li><b>Kitchen order ticket (KOT)</b> — the ticket the kitchen works from.</li>
<li><b>Token slip</b> — the numbered stub the customer collects with.</li>
<li><b>Backup</b> — used when a slip's printer fails after its retries.</li>
</ul>
<div class="note warn"><b>Important.</b> A role with no printer prints nothing: every slip of that kind queues as <i>Pending</i>, as the yellow warning says. Set at least the customer bill and the KOT.</div>`,
      },
      {
        num: '19.4', kicker: 'Printer Center', title: 'Print mode and speed', shot: 'prn-mode', figW: 166,
        lead: 'Fast Billing Mode: the quickest possible printing, for every slip.',
        html: `
<ul class="dots">
<li><b>Raw ESC/POS for everything</b> — sends plain printer commands, with no picture step. Fastest; the logo, QR code and premium layouts are not printed.</li>
<li>Off — the chosen design is drawn and sent as one job; still silent, with no dialog.</li>
<li><b>Raw slip text size</b> — <i>Large</i> (recommended) or <i>Compact</i>.</li>
<li><b>Bold text on raw slips</b> — keeps an ageing print head legible.</li>
</ul>
<p>A single printer can override this, for a machine whose driver refuses raw commands.</p>`,
      },
      {
        num: '19.5', kicker: 'Printer Center', title: 'Receipt design', shot: 'prn-design', figW: 166,
        lead: 'The layout of the bill, and the gallery of premium designs.',
        html: `
<ol class="steps">
<li>Pick a <b>Receipt Template</b>: <b>Standard</b> (the everyday bill), <b>Compact</b> (saves paper) or <b>Detailed</b> (logo, tax, discount, footer and branding).</li>
<li>Or tap a <b>premium design</b> — 11 DT Retail designs and 16 more professional layouts — to preview it with your own order and save it.</li>
<li>Choose whether to show the bill on screen before printing, and whether to keep a copy on screen after billing.</li>
</ol>
<div class="note status"><b>58 mm paper.</b> All designs are made for 80 mm. On 58 mm printers some premium designs are wider than the paper; use Standard, Compact or the DT Retail designs there (see 20.3).</div>`,
      },
      {
        num: '19.6', kicker: 'Printer Center', title: 'Margins', shot: 'prn-margins', figW: 166,
        lead: 'Where the slip sits on the paper — for this computer and per kind of slip.',
        html: `
<ul class="dots">
<li><b>Print margins</b> (top, right, bottom, left, in mm) for this device. Negative values move the print the other way. Presets: 4 mm equal, all 0, 2 mm equal.</li>
<li><b>Printable width</b> — Auto, 48, 58, 64, 68 or 72 mm, or custom. Choose what your printer really prints so the right side is not cut off.</li>
<li><b>Print margin settlement</b> — separate left / right margins for the customer receipt, KOT, token and reports; empty means "inherit".</li>
</ul>
<div class="note tip"><b>Tip.</b> If there is 3–4 inches of blank paper at the top, set the printer driver's paper to "80mm continuous / receipt", then test with a small negative top value.</div>`,
      },
      {
        num: '19.7', kicker: 'Printer Center', title: 'Alignment test', shot: 'prn-alignment', figW: 166,
        lead: 'Print a ruled slip, measure both edges with a ruler, and let the software work out the margins.',
        html: `
<ol class="steps">
<li>Choose the paper profile: 80 mm, 58 mm or 110 mm. The printable width, characters per line and expected gap are shown.</li>
<li>Print the alignment slip (raw ESC/POS or through the Windows driver).</li>
<li>Measure the blank paper at the left and right edges and type both numbers.</li>
<li>The margins that centre the print are calculated for you — no trial and error.</li>
</ol>`,
      },
      {
        num: '19.8', kicker: 'Printer Center', title: 'Print quality', shot: 'prn-quality', figW: 166,
        lead: 'How heavy, dark and sharp slips print on this computer. Designs and layout do not change.',
        html: `
<ul class="dots">
<li><b>Text weight</b> — Standard (regular text, bold headings and totals), Bold or Extra bold.</li>
<li><b>Manual adjust</b> — darkness (1–10) and resolution (2× recommended).</li>
<li><b>Thicken strokes</b> — for a faint printer only.</li>
<li><span class="ui">Reset to Auto (Standard)</span>.</li>
</ul>`,
      },
      {
        num: '19.9', kicker: 'Printer Center', title: 'Calibration', shot: 'prn-calibration', figW: 166,
        lead: 'Fine adjustment, saved for each printer, for a machine that needs its own numbers.',
        html: `
<p>Left, right, top and bottom offsets in mm for each configured printer; negative values are allowed. <span class="ui">Save All</span> stores them with the printer.</p>
<p>Test-print a short receipt, see which side is cut or blank, nudge that value by 0.5–1 mm and test again.</p>
<p>The list is empty until printers are added (19.2).</p>`,
      },
      {
        num: '19.10', kicker: 'Printer Center', title: 'Tokens and printing options', shot: 'prn-tokens', figW: 166,
        lead: 'Tandoor tokens and other options printed at payment time.',
        html: `
<ul class="dots">
<li><b>Language</b> of POS buttons and labels, and the <b>KOT font size</b> (100–200%).</li>
<li><b>Custom payment types</b> — e.g. NETS or a voucher; they appear on the payment screen, the receipt and in reports.</li>
<li><b>Minimart / Retail mode</b> — barcode scanning and a weighing scale for shops.</li>
<li><b>Tandoor Token</b> — a separate token slip for roti / naan, printed on payment, with the categories or items it covers.</li>
<li><b>Business type presets</b>, <b>Enable KOT printing</b>, <b>Manual "Send to Kitchen" only</b> and <b>KOT on the kitchen printer only</b>.</li>
</ul>`,
      },
      {
        type: 'pair', num: '19.11', kicker: 'Printer Center', title: 'Test print, diagnostics and machine setup', figH: 94,
        items: [
          { shot: 'prn-test', figW: 128, caption: '<b>Test print</b>', html: `<p>Prints a sample receipt on 58 or 80 mm to check silent printing, margins and width. <b>Raw ESC/POS Test Mode</b> checks plain printer compatibility; <span class="ui">Test Alignment Print</span> prints the ruler slip.</p>` },
          { shot: 'prn-setup', figW: 128, caption: '<b>Diagnostics &amp; setup</b>', html: `<p><span class="ui">Save diagnostics for support</span> writes one file for Digital Target when something goes wrong. <span class="ui">Save this machine's setup</span> stores the printers, margins, displays and layout, and <span class="ui">Restore a setup file</span> rebuilds them on a replacement PC. Sales and customers are not in this file.</p>` },
        ],
      },
      {
        num: '19.12', kicker: 'Printers', title: 'Printer diagnostic center', shot: 'prn-diagnostics', figW: 166,
        lead: 'Detect, test and troubleshoot every printer — USB, network, shared Windows or ESC/POS thermal.',
        html: `
<ul class="dots">
<li>Counters: checks passed, warnings, failures and printers detected.</li>
<li><b>Health Check</b> with the root cause and the fix for each problem; <span class="ui">Re-run all checks</span>.</li>
<li><span class="ui">Restart Spooler</span> and <span class="ui">Clear Print Queue</span> for a stuck Windows queue.</li>
<li>Tabs: Detection, Network Printer, Test Center, Troubleshooting, Diagnostic Report and Print Log.</li>
</ul>
<div class="note status"><b>Status.</b> Spooler control, auto-detection, raw ESC/POS and the automatic fixes work only in the DT POS Windows app; a browser shows them as warnings, as in this picture.</div>`,
      },
    ],
  },

  // ============================================================ 20
  {
    n: 20, title: 'Feature status and limits', thumb: 'prn-diagnostics',
    intro: 'An honest list of what this edition does not include, what needs the Windows desktop app, and the known limits of version 1.20.1.',
    pages: [
      {
        type: 'raw', num: '20.1', kicker: 'Status', title: 'Modules not in the Offline Edition',
        lead: 'These modules exist in DT POS but depend on the internet or a cloud account. In the Offline Edition they are removed from the menu, and their addresses lead back to the POS.',
        html: `<div class="pair"><div class="col">
<table class="t"><thead><tr><th>Module</th><th>What it does (online edition)</th><th>Offline</th></tr></thead><tbody>
<tr><td>Rider App</td><td>Riders see and update their deliveries on a phone</td><td><span class="pill off">Not available</span></td></tr>
<tr><td>Riders · Live Riders Map</td><td>Rider list with live GPS positions</td><td><span class="pill off">Not available</span></td></tr>
<tr><td>Customer Portal / Website</td><td>Online ordering page for customers</td><td><span class="pill off">Not available</span></td></tr>
<tr><td>Online Order Approval</td><td>Accept or reject online orders</td><td><span class="pill off">Not available</span></td></tr>
<tr><td>Blocked Customers · Blocked Locations</td><td>Stop abusive online orders</td><td><span class="pill off">Not available</span></td></tr>
<tr><td>Customer Map</td><td>Customers on a map</td><td><span class="pill off">Not available</span></td></tr>
<tr><td>Live Map</td><td>Branches and devices on a map</td><td><span class="pill off">Not available</span></td></tr>
<tr><td>Branches · Branches Map</td><td>Several branches in one account</td><td><span class="pill off">Not available</span></td></tr>
<tr><td>Devices</td><td>Approve the devices of an account</td><td><span class="pill off">Not available</span></td></tr>
<tr><td>Software Version</td><td>Version roll-out per client</td><td><span class="pill off">Not available</span></td></tr>
</tbody></table></div>
<div class="col">
<div class="card tint"><h3>Also hidden in Settings</h3><p>The <b>Riders</b>, <b>Online Order</b>, <b>Branches</b> and <b>Devices</b> tabs.</p></div>
<div class="card"><h3>Related features that therefore do not work offline</h3>
<ul class="dots">
<li><b>Table, takeaway and delivery QR codes</b> — they open the online ordering page (5.4).</li>
<li><b>Live rider tracking</b> and customer / branch maps.</li>
<li><b>Order taker portal on a phone</b> — order takers can still use the POS on the till itself.</li>
</ul></div>
<div class="note">Ask Digital Target about the online edition if you need these.</div>
</div></div>`,
      },
      {
        type: 'text', num: '20.2', kicker: 'Status', title: 'Features that need the Windows desktop app', cols: 2,
        lead: 'DT POS Enterprise is delivered as a Windows desktop application. A few features rely on it and do not work if the screens are opened in a web browser.',
        html: `
<table class="t"><thead><tr><th>Feature</th><th>In the desktop app</th><th>In a browser</th></tr></thead><tbody>
<tr><td>Choosing printers by name</td><td><span class="pill ok">Yes</span></td><td>System print dialog</td></tr>
<tr><td>Silent printing (no dialog)</td><td><span class="pill ok">Yes</span></td><td><span class="pill desk">No</span></td></tr>
<tr><td>Raw ESC/POS printing</td><td><span class="pill ok">Yes</span></td><td><span class="pill desk">No</span></td></tr>
<tr><td>Print spooler restart, auto-detection, automatic fixes</td><td><span class="pill ok">Yes</span></td><td><span class="pill desk">No</span></td></tr>
<tr><td>Weighing scale on a COM port (F9)</td><td><span class="pill ok">Yes</span></td><td><span class="pill desk">No</span></td></tr>
<tr><td>Kitchen / customer display on a chosen monitor</td><td><span class="pill ok">Yes</span></td><td>New tab, moved by hand</td></tr>
<tr><td>Data in a DT-POS folder with automatic copies</td><td><span class="pill ok">Yes</span></td><td>Browser storage</td></tr>
</tbody></table>
<div class="card tint"><h3>Automatic safety copies</h3>
<p>The desktop app keeps the database in a <code>DT-POS</code> folder together with the previous good copy and a snapshot taken whenever the software version changes. Day Close can also download a JSON backup every day. Copy that folder — or the JSON backups — to a USB drive regularly.</p></div>
<div class="card"><h3>WhatsApp</h3>
<p>All WhatsApp features open WhatsApp Web with the message filled in; a person presses Send. They need an internet connection and a phone linked to WhatsApp Web. Nothing else in the POS needs the internet.</p></div>`,
      },
      {
        type: 'text', num: '20.3', kicker: 'Status', title: 'Known limits of version 1.20.1', cols: 2,
        lead: 'Things that work differently from what their labels might suggest, or that are not finished. They are listed so nobody is surprised.',
        html: `
<div class="card"><h3>Action permissions are saved but not yet enforced</h3>
<p>The <b>feature</b> ticks in <span class="path">Users → Edit user</span> (Edit Bill, Void, Refund, Apply Discount, Open Cash Drawer…) are stored, but the screens do not check them yet. What a user can do is decided by the <b>pages</b> they can open, by the administrator-and-manager-only screens (Settings, Users, Void / Comp / Cancel, Bill Editor, Accounts, HR, Backup and others), and by <b>cashier discount approval</b> in Settings.</p></div>
<div class="card"><h3>Foodpanda is tracked by hand</h3>
<p>There is no link to Foodpanda's systems. Orders from the Foodpanda tablet are entered on the POS as the Foodpanda order type; DT POS then tracks them and reports them separately.</p></div>
<div class="card"><h3>58 mm printers and some designs</h3>
<p>Receipt designs are made for 80 mm. On 58 mm paper, 14 of the premium receipt designs and the <i>Classic</i> kitchen-slip design are wider than the paper and are cut at the edge. Use Standard, Compact or a DT Retail design on 58 mm printers.</p></div>
<div class="card"><h3>Country "Tax %" is a reference</h3>
<p>The tax rate next to the country in <span class="path">Settings → General</span> is not used on bills. Bills use <b>GST / VAT %</b> (or the fixed tax amount).</p></div>
<div class="card"><h3>Licensing is managed by Digital Target</h3>
<p>Licence keys, renewals, device limits and suspensions are handled by Digital Target's own administration console, which is not part of the restaurant software. Contact support for any licence change.</p></div>
<div class="card"><h3>Not verified for this guide</h3>
<p>The pictures were taken in a browser on a test computer. Printing on physical printers, the weighing scale and the Windows-only tools were not exercised while preparing this guide; their descriptions come from the software itself.</p></div>`,
      },
    ],
  },

  // ============================================================ 21
  {
    n: 21, title: 'Appendix', thumb: 'staff-user-edit',
    intro: 'Default access per role, the words used in this guide, and how to reach Digital Target.',
    pages: [
      {
        type: 'raw', num: 'A', kicker: 'Appendix', title: 'Default page access per role',
        tocTitle: 'A · Default page access per role',
        lead: `The pages each role can open when a user is created, taken from the software's own permission list (${offlinePages.length} pages of the Offline Edition). An administrator can change this for any single user (15.5). Administrators always see everything.`,
        html: `<div class="pair"><div class="col">${roleTable(offlinePages.slice(0, half))}</div><div class="col">${roleTable(offlinePages.slice(half))}</div></div>`,
      },
      {
        type: 'text', num: 'B', kicker: 'Appendix', title: 'Glossary', tocTitle: 'B · Glossary', cols: 3,
        lead: 'The words used on the screens and in this guide.',
        html: `
<p><b>Business day</b> — the trading day used by reports, e.g. 08:00 to 03:00 the next morning, so late-night sales count on the right day.</p>
<p><b>Complimentary (comp)</b> — food given free, recorded with a reason.</p>
<p><b>Credit / udhaar</b> — a bill the customer will pay later; tracked in Credits until paid.</p>
<p><b>Day Close</b> — the end-of-day routine: shift report, archive, and a clean live list.</p>
<p><b>Deal / combo</b> — several items sold together at one price.</p>
<p><b>Dine-in / Takeaway / Delivery</b> — the three order types (Foodpanda is an optional fourth).</p>
<p><b>GRN</b> — goods received note: a delivery from a supplier, entered in Receiving.</p>
<p><b>Hold</b> — an order parked unpaid, to be resumed later.</p>
<p><b>KOT</b> — kitchen order ticket: the slip the kitchen cooks from. Later KOTs for the same bill list only changes.</p>
<p><b>Order taker</b> — a role that takes orders and sends them to the kitchen but does not take payment.</p>
<p><b>Partial payment</b> — part of a bill paid; the rest is collected from Pending Payments.</p>
<p><b>Party</b> — a supplier or account customer with a ledger.</p>
<p><b>Payment account</b> — a bank, JazzCash or Easypaisa account that receives online payments.</p>
<p><b>PIN</b> — an optional 4-digit quick sign-in code for a user.</p>
<p><b>Recipe</b> — the ingredients used by one plate of an item; stock is reduced by it when the item is paid.</p>
<p><b>Running</b> — an order sent to the kitchen and not yet paid.</p>
<p><b>Service charge</b> — a percentage or fixed charge added to chosen order types.</p>
<p><b>Size / variant</b> — Small, Medium, Large or inches, each with its own price.</p>
<p><b>Theme</b> — the colour look of the screens; it never changes data or printing.</p>
<p><b>Token (tandoor)</b> — a separate numbered slip for roti / naan, recorded in the Token Module.</p>
<p><b>Void</b> — a bill cancelled after it was made, recorded with a reason.</p>
<p><b>Wastage</b> — stock thrown away or used without a sale, with its cost.</p>`,
      },
      {
        type: 'text', num: 'C', kicker: 'Appendix', title: 'Support and contact', tocTitle: 'C · Support and contact', cols: 2,
        lead: 'Digital Target develops and supports DT POS Enterprise.',
        html: `
<div class="card tint"><h3>Digital Target</h3>
<p>Burewala, Pakistan<br>
<b>Call:</b> +92 345 1873354<br>
<b>WhatsApp:</b> +92 332 2373354<br>
<b>Email:</b> digitaltarget.digital@gmail.com<br>
<b>Website:</b> www.digitaltarget.digital<br>
<b>Facebook:</b> facebook.com/digitaltargetpk · <b>Instagram:</b> @digitaltarget_pk</p></div>
<div class="card"><h3>When you contact support</h3>
<ul class="dots">
<li>Say which computer (counter, kitchen, manager) and what you were doing.</li>
<li>For a printing problem, send the file from <span class="path">Printers &amp; Print Server → Diagnostics &amp; setup → Save diagnostics for support</span>.</li>
<li>For a licence question, have the code from the activation screen ready.</li>
<li>Never send your admin password or a backup file to anyone you do not know.</li>
</ul></div>
<div class="card"><h3>About this document</h3>
<p>DT POS Enterprise — User Guide &amp; Feature Overview, for software version 1.20.1 (Offline Edition), October 2026. Screens may change in later versions; the release notes list every change.</p></div>`,
      },
    ],
  },
];
