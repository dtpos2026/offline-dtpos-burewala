// Chapters 16–17: Reports & dashboard, Day close & data safety.
export default [
  // ============================================================ 16
  {
    n: 16, title: 'Dashboard and reports', thumb: 'rep-dashboard',
    intro: 'How the business is doing today and over time: the dashboard, the bill and category reports, the Reports Center, item and variant analysis, profit and food cost.',
    pages: [
      {
        num: '16.1', kicker: 'Dashboard', title: 'Dashboard', shot: 'rep-dashboard', figW: 166,
        lead: 'The owner\'s first screen: today\'s business and the last 7 or 30 days, on one page.',
        legend: [
          '<b>Greeting</b> — with <span class="ui">Refresh</span> and <span class="ui">New Sale</span> (opens the POS).',
          '<b>Cashier</b> — all cashiers or one.',
          '<b>Period</b> — Today, 7 days or 30 days.',
          '<b>Key figures</b> — sales, orders, average order, profit (sales minus expenses), cash, card / bank / other, discounts given and tables occupied.',
        ],
        html: `
<h4>Business day</h4>
<p>The <b>Business day</b> card shows the day's window (e.g. 08:00 → 03:00 the next morning), today's and yesterday's sale, the current shift since its start, and cash received. Late-night bills therefore count in the right day.</p>
<p>The day's start time is set in <span class="path">Settings → KOT Settings → Business day start</span> (08:00 by default); every report uses the same window.</p>`,
      },
      {
        num: '16.2', kicker: 'Dashboard', title: 'Dashboard — trends and live panels', shot: 'rep-dashboard-2', figW: 166,
        lead: 'Further down the dashboard: where the sales come from and what needs attention now.',
        html: `
<ul class="dots">
<li><b>Sales trend</b> — sales per day for the period.</li>
<li><b>Order types</b> — dine-in, takeaway and delivery, by amount and share.</li>
<li><b>Top selling items</b> — the best sellers by amount.</li>
<li><b>Sales by hour</b> — today's busy hours.</li>
<li><b>Payment methods</b> — cash, online and card.</li>
<li><b>Kitchen — live</b> — open kitchen orders.</li>
<li><b>Low stock</b> — items to reorder.</li>
<li><b>Delivery and credit</b> — open deliveries and outstanding credit.</li>
</ul>`,
      },
      {
        num: '16.3', kicker: 'Reports', title: 'Reports — bills and totals', shot: 'rep-reports', figW: 166,
        lead: 'The main sales report: every bill in the period, totals by order type and source, and the status of unpaid bills.',
        html: `
<ol class="steps">
<li>Pick <b>Today</b>, <b>Yesterday</b>, <b>This Week</b>, <b>This Month</b> or <b>Custom</b> — the start and end follow the business day (e.g. 08:00 to 03:00).</li>
<li>Optionally choose one cashier, search for anything — bill, product, category, customer, phone, table — or open <span class="ui">Filters</span>.</li>
<li>Read the totals: paid sales, dining, takeaway, delivery, and <b>Sales by Source</b> (POS counter, order taker, website, delivery).</li>
</ol>
<p>The warning card lists <b>unpaid / running bills</b> that are not in sales yet. The coloured tiles total paid, running, credit, void, cancelled and complimentary bills.</p>
<p><span class="ui">Export PDF</span> saves the report; <span class="ui">POS Summary</span> and <span class="ui">POS Detailed</span> print it on the receipt printer.</p>`,
      },
      {
        num: '16.4', kicker: 'Reports', title: 'Reports — cashiers and the bill list', shot: 'rep-reports-2', figW: 166,
        lead: 'Further down the same report: what each cashier took, and every paid bill.',
        html: `
<h4>Cashier performance</h4>
<p>Orders, total, cash and other payments per cashier, with a total row — for checking each drawer at closing time.</p>
<h4>Paid orders</h4>
<p>Bill number, customer, phone, type, payment method and account, amount, date and time, and the number of reprints. The icons print a bill again, and the arrow opens its details.</p>
<div class="note tip"><b>Tip.</b> The number of reprints in the period is shown above the list. Many reprints of the same bill are worth a question.</div>`,
      },
      {
        num: '16.5', kicker: 'Reports', title: 'Category and product wise', shot: 'rep-reports-category', figW: 166,
        lead: 'The same period by category and by product: quantity sold, sales, discounts, service charge and the net amount.',
        html: `
<ol class="steps">
<li>In Reports, choose <span class="ui">Category &amp; Product wise</span>.</li>
<li>Show all categories or one; sort by net amount, quantity sold, sales or name.</li>
<li>Each category row is followed by its products.</li>
</ol>
<p>The cards total the quantity sold, sales, discounts, service charge and net amount. Discounts and service charge are shared out over the items of each bill, so the net amounts add up to the bills.</p>
<p><span class="ui">Excel / CSV</span> exports the table; <span class="ui">Print 80mm</span> prints it.</p>`,
      },
      {
        type: 'pair', num: '16.6', kicker: 'Reports Center', title: 'Reports Center', figH: 92,
        lead: 'Management reports in one place, with a full PDF export. Pick the dates, then a tab.',
        items: [
          { shot: 'rep-center', figW: 128, caption: '<b>Paid Sales</b> tab, with the summary cards.', html: `<p>Cards: paid sales, credit, discount given, void, complimentary and cancelled. Tabs: <b>Paid Sales</b>, <b>Payments by Account</b>, <b>Credit</b>, <b>Discount</b>, <b>Category Discount</b>, <b>Credit Recovery</b>, <b>Kitchen Status</b>, <b>Kitchen KOT Reports</b> and <b>Management Control</b>. Each tab prints; <span class="ui">Export Full PDF</span> saves them all.</p>` },
          { shot: 'rep-center-accounts', figW: 128, caption: '<b>Payments by Account</b> — cash drawer, JazzCash, bank.', html: `<p>Totals per payment account with the number of bills, then every bill with its method and account — check it against the bank or wallet statement.</p><p><b>Kitchen KOT Reports</b> list each order's KOTs, items added and cancelled after the first KOT, and preparation and serving minutes.</p>` },
        ],
      },
      {
        num: '16.7', kicker: 'Reports', title: 'Sales report and shift report', shot: 'rep-sales', figW: 160,
        lead: 'A printable sales report by category, product, order type or payment — and the shift report for the thermal printer.',
        html: `
<ol class="steps">
<li>Choose the period: Today, Yesterday, Last 7 Days, This Month, This Year or Custom Dates.</li>
<li>Choose the order types: All, Dine-In, Takeaway, Delivery or Online / Drive.</li>
<li>Choose the view: <b>Category-wise</b>, <b>Product-wise</b>, <b>Order Type</b>, <b>Payment Type</b> or <b>Shift Report</b>.</li>
<li><span class="ui">Print A4</span> or <span class="ui">Print Shift Report (Thermal)</span>.</li>
</ol>
<p>The report heads with the restaurant name, address and period, then orders, items sold, discount and net sales, followed by the chosen breakdown.</p>`,
      },
      {
        num: '16.8', kicker: 'Reports', title: 'Advanced item and variant reports', shot: 'rep-advanced', figW: 166,
        lead: 'What sold, size by size: every product and variant with quantity, gross, discount and net — from every source.',
        html: `
<ul class="dots">
<li>Choose the period and the source: All, POS, Website, Foodpanda, Delivery, Takeaway or Dining.</li>
<li>Group <b>Item-wise</b>, <b>Variant-wise</b> (each size on its own line), <b>Category-wise</b> or <b>Subcategory-wise</b>.</li>
<li><span class="ui">Export CSV</span> for a spreadsheet.</li>
</ul>
<p>Use it to see which pizza size sells best, or which flavours to drop.</p>
<div class="note">Administrators and managers.</div>`,
      },
      {
        num: '16.9', kicker: 'Reports', title: 'Admin sales history', shot: 'rep-admin-history', figW: 166,
        lead: 'Sales kept permanently — even after Day Close or Reset Sale — for the administrator.',
        html: `
<p>Every bill closed by a Day Close is copied to this archive first, so past periods can always be reported.</p>
<ul class="dots">
<li>Filter by period, order type and cashier.</li>
<li>Revenue, paid orders, discounts and tax; by order type; day-wise; cashier-wise; and item-wise sales.</li>
<li><span class="ui">CSV</span>, <span class="ui">Item CSV</span> and <span class="ui">Print / Save as PDF</span>.</li>
</ul>
<div class="note warn"><b>Take care.</b> <span class="ui">Clear Archive</span> deletes this history permanently. Export it first.</div>`,
      },
      {
        num: '16.10', kicker: 'Profit', title: 'Profitability', shot: 'rep-profitability', figW: 166,
        lead: 'Revenue against food cost and wastage: gross and net profit, and the items that earn — or lose — the most.',
        html: `
<ul class="dots">
<li><b>Revenue</b>, <b>food cost</b> (from recipes), <b>food cost %</b> against a 30–35% target, <b>gross profit</b>, <b>wastage</b> and <b>net profit</b>.</li>
<li><b>Top items by revenue</b> and <b>best margin items</b>.</li>
<li><b>Low-margin items</b> — review their price or recipe.</li>
</ul>
<div class="note warn"><b>Accuracy.</b> The yellow line says how many active items have recipes. Items without a recipe count as no cost, which makes profit look higher than it is.</div>`,
      },
      {
        num: '16.11', kicker: 'Profit', title: 'Cost reports', shot: 'rep-costing', figW: 166,
        lead: 'Food cost per item for the period, and the stock side of costing.',
        html: `
<p>Totals: sales, food cost, profit and food cost % with the margin. Tabs:</p>
<ul class="dots">
<li><b>Food Cost</b> — quantity, sales, cost and FC % per item.</li>
<li><b>Profitability</b> — profit per item.</li>
<li><b>Consumption</b> — ingredients used by the recipes.</li>
<li><b>Inventory Valuation</b> — the value of the stock on hand.</li>
</ul>
<p>Each tab prints.</p>`,
      },
      {
        num: '16.12', kicker: 'Tokens', title: 'Token module', shot: 'rep-tokens', figW: 166,
        lead: 'The register of tandoor tokens (separate slips for roti / naan) with payment status and department reconciliation.',
        html: `
<p>When <b>Tandoor Token</b> printing is on, each token printed is counted here with its number, items, pieces, amount and payment status.</p>
<ul class="dots">
<li>Pick a date; filter by payment, department, token number, order number or cashier; show reprinted tokens only.</li>
<li>The counters total tokens, pieces, reprints and departments.</li>
</ul>
<div class="note status"><b>Status.</b> Token printing is off by default. Turn it on and choose the token categories or items in <span class="path">Printers &amp; Print Server → Tokens</span> (19.10).</div>`,
      },
    ],
  },

  // ============================================================ 17
  {
    n: 17, title: 'Day close and data safety', thumb: 'close-day',
    intro: 'Ending the business day properly, starting fresh when needed, and keeping a safe copy of everything.',
    pages: [
      {
        num: '17.1', kicker: 'Day Close', title: 'Day close — before you close', shot: 'close-day', figW: 166,
        lead: 'Day Close prints the shift report, archives the day\'s bills and clears the live list for tomorrow — after warning about anything still open.',
        html: `
<p>The counters show open bills, bills on hold and unpaid, bills in the live list and cashier requests. A yellow warning lists bills still open; <span class="ui">Open Retrieve</span> takes you to them.</p>
<h4>Step 1 · Shift report</h4>
<ol class="steps">
<li>Type the <b>starting cash</b> (drawer float).</li>
<li>Print the shift report for <b>Today</b> — or Yesterday, Last 7 days, This month, This year, custom dates or the full sales report.</li>
</ol>
<p>Reports for past dates stay available after a Day Close: every bill goes to the permanent archive (16.9).</p>`,
      },
      {
        num: '17.2', kicker: 'Day Close', title: 'Day close — clearing and closing', shot: 'close-day-2', figW: 166,
        lead: 'Choose what leaves the live lists, then close the day.',
        html: `
<h4>Step 2 · What Day Close clears</h4>
<ul class="dots">
<li>Paid / closed bills · running and held unpaid bills · void, complimentary and cancelled bills · credit orders.</li>
<li><b>Set every table to Free</b> and <b>restart the daily order number</b>.</li>
<li><b>Download a JSON backup first</b> (recommended — keep it ticked).</li>
</ul>
<p>Only ticked groups leave the live lists; the archive keeps every bill. <span class="ui">Save Day Close settings</span> remembers your choice.</p>
<h4>Step 3 · Close the day</h4>
<p>The administrator presses <span class="ui">Close the day (Admin)</span>. A cashier with the <b>Day Close</b> page permission can <b>request</b> a Day Close instead; the request appears for the administrator to confirm.</p>
<div class="note">Unpaid credit is carried forward. It is not deleted by Day Close.</div>`,
      },
      {
        num: '17.3', kicker: 'Day Close', title: 'Reset sale', shot: 'close-reset-sale', figW: 166,
        lead: 'Sets chosen modules back to zero — for example after training, before the real opening day.',
        html: `
<ol class="steps">
<li>On the Day Close screen choose <span class="ui">Reset Sale</span>.</li>
<li>Tick the modules to reset: orders / sales (moved to the archive), table status, stock logs, wastage, cash closes, accounts, ledgers, parties, customers, receiving, inventory, attendance, advances, marketing contacts, print queue and token register. <span class="ui">Daily Default</span> ticks the usual set.</li>
<li>Press <span class="ui">Reset selected to zero</span> and confirm.</li>
</ol>
<div class="note warn"><b>Take care.</b> Items marked <b>⚠</b> — accounts, ledgers, parties, customers, receiving and inventory — are master data. Resetting them cannot be undone. Take a backup first (17.4).</div>`,
      },
      {
        num: '17.4', kicker: 'Backup', title: 'Backup and restore', shot: 'close-backup', figW: 140,
        lead: 'A complete copy of the restaurant\'s data in one file — to keep safe, or to move to a new computer.',
        html: `
<ul class="dots">
<li><b>Data Storage Location</b> — where the data lives. In the desktop app it is a <code>DT-POS</code> folder: beside the program, on a non-C drive such as <code>D:\DT-POS</code>, or in the Windows user's AppData as a last resort. It holds the database, the previous good copy, dated backups and logs. (This picture was taken in a browser, which keeps the data in browser storage.)</li>
<li><span class="ui">Export JSON</span> — downloads all data as one backup file. Keep copies on a USB drive or in email.</li>
<li><span class="ui">Import JSON</span> — restores a backup file. It replaces the data on this computer.</li>
<li><span class="ui">Reset Data</span> — returns everything to the starting demo data.</li>
<li><span class="ui">Erase Data…</span> — deletes only the data you choose (administrators).</li>
</ul>
<div class="note warn"><b>Take care.</b> Import, Reset and Erase replace or delete data and cannot be undone. Export a backup before using them.</div>
<div class="note tip"><b>Habit.</b> Keep "Download a JSON backup first" ticked in Day Close: you then get a backup every day automatically.</div>`,
      },
    ],
  },
];
