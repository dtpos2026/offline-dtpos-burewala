// Chapters 11–15: Menu, Inventory & food cost, Customers & marketing, Accounts, Staff & users.
export default [
  // ============================================================ 11
  {
    n: 11, title: 'Menu and deals', thumb: 'menu-manager',
    intro: 'Categories, items, sizes and prices; importing a whole menu from Excel; and combo deals.',
    pages: [
      {
        num: '11.1', kicker: 'Menu', title: 'Menu manager', shot: 'menu-manager', figW: 170,
        lead: 'Every category and item the POS sells, with its kitchen, pricing type, status and price.',
        legend: [
          '<b>+ Category</b> — add a category with an emoji icon or a picture.',
          '<b>+ Item</b> — add an item (11.2).',
          '<b>Import Excel/CSV</b> — load or update the whole menu (11.3).',
          '<b>Bulk Upload Images</b> — attach pictures to many items at once.',
          '<b>Recycle Bin</b> — deleted items and categories, ready to restore.',
        ],
        html: `
<p>The category chips under the search box filter the list; their arrows change the order the POS shows them in, and the pencil and bin edit or delete the category.</p>
<p>Tick items to act on many at once: <b>Move to Category</b>, <b>Set Sub-Category</b>, <b>Mark Active</b> / <b>Mark Inactive</b> or <b>Delete</b>.</p>
<div class="note warn"><b>Take care.</b> <span class="ui">Delete All Menu</span> permanently removes every item and category. You must type <code>DELETE ALL</code> to confirm.</div>`,
      },
      {
        num: '11.2', kicker: 'Menu', title: 'Adding or editing an item', shot: 'menu-item-dialog', figW: 96,
        lead: 'One form for every kind of item: a fixed price, sizes, inches, sold by weight, or an open price typed at the POS.',
        html: `
<ol class="steps">
<li><b>Name</b>, <b>category</b> and the <b>kitchen</b> (station) that prepares it — the item's KOT goes to that kitchen.</li>
<li><b>Flavors / Variations</b> (optional) — e.g. <i>Spicy, Mild</i>; the customer must pick one on online orders.</li>
<li><b>Sub-Category / Flavor Group</b> (optional) — groups flavours, e.g. <i>Pizza Flavors</i>.</li>
<li><b>Pricing type</b>:
<ul class="dots">
<li><b>Fixed</b> — one price.</li>
<li><b>Size wise</b> — Small / Medium / Large rows, each with its own price (shown here).</li>
<li><b>Inch wise</b> or <b>both</b> — 9″, 12″… with prices.</li>
<li><b>Weight</b> — a rate per kg (4.5).</li>
<li><b>Manual</b> — the price is typed on the POS.</li>
</ul></li>
<li><b>Stock link</b> (optional) — for shop items: each sale takes one unit from that inventory item. If the item also has a recipe, the recipe is used instead (12.3).</li>
<li><b>Barcode</b> (EAN-13 / UPC) and <b>PLU</b> (scale label code) — for scanning at the POS.</li>
<li>Upload a picture, set <b>Active</b>, and save.</li>
</ol>
<div class="note">An inactive item stays in the menu list but is hidden from the POS.</div>`,
      },
      {
        num: '11.3', kicker: 'Menu', title: 'Importing a menu from Excel', shot: 'menu-import', figW: 110,
        lead: 'Load a complete menu — categories, items, sizes and ingredients — from one Excel or CSV file.',
        html: `
<ol class="steps">
<li>Press <span class="ui">Download menu template</span> and fill it in Excel, keeping the column names.</li>
<li>Use the sheets <b>Categories</b> (name, icon), <b>Menu Items</b> (name, category, sub-category, price, pricing type, size / inch name and price, image, kitchen) and, optionally, <b>Ingredients</b> for the inventory.</li>
<li>For pizzas, repeat the item name on several rows with a different size — they are merged into one item with sizes.</li>
<li>Press <span class="ui">Choose an Excel/CSV file</span>, check the preview and import.</li>
</ol>
<p><span class="ui">Excel format guide — Menu</span> explains every column; <span class="ui">Copy for ChatGPT</span> copies the same instructions so an AI assistant can turn an existing price list into the right format.</p>
<div class="note tip"><b>Tip.</b> Deals can be imported the same way from <span class="path">Deals / Combos → Bulk Import Deals from Excel</span>. The full column reference is in <i>docs/EXCEL_IMPORT_GUIDE.md</i>.</div>`,
      },
      {
        num: '11.4', kicker: 'Menu', title: 'Deals and combos', shot: 'menu-deals', figW: 168,
        lead: 'A fixed price for a set of items. Deals appear on the POS in a Deals category and are billed like any item.',
        html: `
<ol class="steps">
<li>Press <span class="ui">Add Deal</span>.</li>
<li>Give it a name and a picture, and set the combo price.</li>
<li>Add the items and quantities — for sized items choose the size, e.g. <i>1 × Chicken Fajita Pizza — Large</i>.</li>
<li>Save. The deal is added to <span class="path">Menu → Deals</span>.</li>
</ol>
<p>Each card shows the deal's items and price, with edit and delete. <span class="ui">Bulk Import Deals from Excel</span> loads many deals at once.</p>
`,
      },
    ],
  },

  // ============================================================ 12
  {
    n: 12, title: 'Inventory and food cost', thumb: 'stock-recipes',
    intro: 'Stock of raw materials and shop items, recipes that use stock automatically, purchases (GRN) and wastage — and the food-cost figures they produce.',
    pages: [
      {
        num: '12.1', kicker: 'Inventory', title: 'Inventory', shot: 'stock-inventory', figW: 172,
        lead: 'Every stock item with its quantity, unit, average cost and status. Low-stock items are listed at the top.',
        html: `
<ul class="dots">
<li>The <b>Low Stock Alert</b> names each item at or below its minimum level.</li>
<li>Counters: total items, in stock, low stock, out of stock.</li>
<li>Search by name or SKU; filter by category and status.</li>
<li>Per item: <b>In</b> and <b>Out</b> (12.2), <b>edit</b> and <b>delete</b>.</li>
</ul>
<p><span class="ui">Add Item</span> asks for the name, SKU, category, the <b>base unit</b> (kg, g, l, ml or pcs), the cost, the minimum level, and any <b>purchase units</b> — for example <i>1 Bag = 25 kg</i>, <i>1 Crate = 24 pcs</i> — so purchases can be entered the way the supplier sells them.</p>
<p><b>Avg Cost / Unit</b> is kept up to date automatically from purchases (12.4).</p>`,
      },
      {
        type: 'pair', num: '12.2', kicker: 'Inventory', title: 'Stock in, stock out, and recipes', figH: 92,
        items: [
          { shot: 'stock-in-dialog', figH: 66, caption: '<b>Stock In</b> — from In on an inventory row.', html: `<p>Shows the current stock. Type the quantity received and an optional note, then <span class="ui">Add Stock</span>. <b>Out</b> works the same way for stock taken out. <span class="ui">History</span> lists every movement of the item: in, out, sales and adjustments.</p><div class="note tip"><b>Tip.</b> Use Receiving (12.4) for supplier deliveries — it also records the price and the supplier's ledger.</div>` },
          { shot: 'stock-recipe-dialog', figH: 92, caption: '<b>Recipe</b> — ingredients for one plate.', html: `<p>When an order for the item is <b>paid</b>, these quantities are taken from inventory automatically. Enter them for one plate (or one kg for weight items), in any unit — g, kg, ml, pcs.</p><p>The <b>Food Cost</b> is worked out from each ingredient's average cost, e.g. <i>Beef Smash Burger: Rs 319</i>.</p>` },
        ],
      },
      {
        num: '12.3', kicker: 'Inventory', title: 'Recipes and food cost', shot: 'stock-recipes', figW: 172,
        lead: 'Every menu item — and every size of it — with its recipe, food cost, price and margin.',
        html: `
<ol class="steps">
<li>Find the item (each size of a pizza has its own row).</li>
<li>Press <span class="ui">Build</span> (no recipe yet) or <span class="ui">Edit</span>.</li>
<li>Add the ingredients and quantities, then <span class="ui">Save Recipe</span>.</li>
</ol>
<p>The list shows how many ingredients each recipe has, the food cost, the sale price and the margin. The count at the top right tells you how many items still have no recipe.</p>
<div class="note">Profit and food-cost reports (16.10) are only as accurate as the recipes. Items without a recipe are reported with no cost.</div>`,
      },
      {
        type: 'pair', num: '12.4', kicker: 'Inventory', title: 'Receiving — goods received notes (GRN)', figH: 96,
        lead: 'Record each delivery from a supplier: the stock goes up, the average cost is updated and the supplier\'s ledger is charged.',
        items: [
          { shot: 'stock-receiving', figW: 150, figH: 96, caption: '<b>Receiving</b> — the list of deliveries.', html: `<p>Date, supplier, item, quantity in the purchase unit (e.g. <i>2 Bag (25 kg)</i>), the stock added in the base unit (<i>+50 kg</i>), rate, total and who received it. Print a GRN slip or delete an entry; filter by date.</p>` },
          { shot: 'stock-receiving-new', figW: 104, figH: 96, caption: '<b>New Receiving Entry</b>', html: `<ol class="steps"><li>Type the supplier — existing parties are suggested; a new name is added to Party Master.</li><li>Choose the item, quantity, purchase unit and rate.</li><li>Add any surcharge (freight, loading, tax) — it is spread into the unit cost.</li><li><span class="ui">Save Entry &amp; Update Stock</span>.</li></ol>` },
        ],
      },
      {
        num: '12.5', kicker: 'Inventory', title: 'Wastage', shot: 'stock-wastage', figW: 172,
        lead: 'Stock thrown away or used without a sale, with its cost — so stock levels stay true and the loss is visible.',
        html: `
<ol class="steps">
<li>Press <span class="ui">Log Wastage</span>.</li>
<li>Choose the item and quantity and a reason: <b>Expired</b>, <b>Damaged</b>, <b>Spilled</b>, <b>Customer Returned</b>, <b>Staff Meal</b> or <b>Other</b>; add a note.</li>
<li>Save. The stock is reduced and the cost is recorded at the item's cost price.</li>
</ol>
<p>The counters show today's and this month's wastage cost. Wastage also appears in the Profitability report (16.10).</p>
<div class="note">Recipes, wastage, profitability and cost reports are switched on together with <span class="path">Settings → General → Food Cost &amp; Profit Tracking</span>. Off, the POS keeps simple stock without cost columns.</div>`,
      },
    ],
  },

  // ============================================================ 13
  {
    n: 13, title: 'Customers and marketing', thumb: 'cust-database',
    intro: 'A customer database that builds itself from your bills, insights about who buys what, promo codes, and WhatsApp messages to one or many customers.',
    pages: [
      {
        num: '13.1', kicker: 'Customers', title: 'Customer database', shot: 'cust-database', figW: 168,
        lead: 'Every customer whose name or phone was entered on a bill — saved automatically, with their spend, orders and loyalty points.',
        html: `
<ul class="dots">
<li>Each card: name, phone, address, lifetime spend, number of orders, loyalty points, last order and tags such as <b>VIP</b>.</li>
<li>Search by name or phone.</li>
<li><span class="ui">View</span> opens the customer profile (13.2); the pencil edits; the green button opens WhatsApp; the bin deletes.</li>
<li><span class="ui">Export Excel</span> saves the full list; <span class="ui">Phones Only</span> saves just names and numbers.</li>
</ul>
<p>The header shows the number of customers and their lifetime spend.</p>
<p><b>Loyalty</b>: when switched on in <span class="path">Settings → General → Loyalty Program</span>, customers earn points on every paid order and can redeem them at the POS.</p>`,
      },
      {
        num: '13.2', kicker: 'Customers', title: 'Customer profile', shot: 'cust-view', figW: 150,
        lead: 'Everything you know about one customer, worked out from their bills.',
        html: `
<ul class="dots">
<li><b>Grade</b> by lifetime spend: <i>Regular</i>, <i>Silver</i> (Rs 5,000+), <i>Gold</i> (Rs 20,000+), <i>Platinum</i> (Rs 50,000+).</li>
<li><b>Total orders</b>, <b>total spent</b>, <b>average order</b> and <b>how often</b> they order.</li>
<li><b>Last order</b>, <b>days since</b>, <b>favourite item</b> and <b>favourite category</b>.</li>
<li>The last twelve orders with date, type, status, items and total.</li>
</ul>
<p><span class="ui">Send Promo</span> opens WhatsApp with a ready message for the customer's grade.</p>`,
      },
      {
        type: 'pair', num: '13.3', kicker: 'Customers', title: 'Top customers and CRM insights', figH: 86,
        items: [
          { shot: 'cust-top', figW: 128, caption: '<b>Top Customers</b> tab — by lifetime spend.', html: `<p>The twenty best customers by lifetime spend, with orders and phone. <b>Rider Performance</b> (the third tab) ranks riders by deliveries.</p>` },
          { shot: 'cust-crm', figW: 128, caption: '<b>CRM Insights</b> — retention and frequency.', html: `<p>Total customers and orders, paid sales (GMV), repeat rate and average basket; sign-ups by month; how many customers ordered once, 2–5, 5–10 or 10+ times; and the top ten by spend.</p>` },
        ],
      },
      {
        num: '13.4', kicker: 'Marketing', title: 'Contacts — WhatsApp messages to many customers', shot: 'cust-contacts', figW: 168,
        lead: 'Pick customers — or import a list from Excel — and send each one a personal WhatsApp message.',
        html: `
<ol class="steps">
<li>Choose <span class="ui">Customers</span>, or <span class="ui">Import Excel</span> for an outside list.</li>
<li>Filter by Dining, Takeaway, Delivery or Imported; tick the contacts.</li>
<li>Write the message. <code>{name}</code>, <code>{restaurant}</code>, <code>{category}</code> and <code>{phone}</code> are filled in for each person; the preview shows the result.</li>
<li>Press <span class="ui">Send to … selected</span>, or <span class="ui">Send</span> on one row.</li>
</ol>
<div class="note status"><b>Status.</b> Messages go through WhatsApp Web: a window opens for each contact with the text filled in, and you press Send there. There is no automatic bulk sending.</div>`,
      },
      {
        type: 'pair', num: '13.5', kicker: 'Marketing', title: 'Promo codes', figH: 90,
        lead: 'Discount codes customers quote at the counter, with dates, limits and a usage count.',
        items: [
          { shot: 'cust-promo', figW: 146, figH: 90, caption: '<b>Promo Codes</b> — the list.', html: `<p>Code, type (percent or rupees), value, validity, used / limit and status. Edit or delete with the icons. Codes are applied in the POS bill (4.7).</p>` },
          { shot: 'cust-promo-new', figW: 104, figH: 90, caption: '<b>New Promo Code</b>', html: `<ol class="steps"><li>Type the code, e.g. <code>EID50</code>.</li><li>Choose <b>Percentage</b> or a fixed amount, and the value.</li><li>Optional: start and end date, usage limit, minimum order.</li><li>Leave <b>Active</b> on and <span class="ui">Save</span>.</li></ol>` },
        ],
      },
      {
        num: '13.6', kicker: 'Marketing', title: 'WhatsApp', shot: 'cust-whatsapp', figW: 168,
        lead: 'Send one customer a message from a template — order ready, bill paid, delivery status — without leaving the POS.',
        html: `
<ol class="steps">
<li>Type the customer's number.</li>
<li>Pick a <span class="ui">Quick Template</span> — the message is filled in. Edit it if you like.</li>
<li>Press <span class="ui">Send</span>.</li>
</ol>
<p>The first time, press <span class="ui">Open WhatsApp Popup</span> and scan the QR code with the restaurant's phone; the session is remembered.</p>
<p>Templates are edited in <span class="path">Settings → WhatsApp</span>; the default delivery-status template is also used by the delivery board. The pickup "order ready" message is set in <span class="path">Settings → Self-Pickup</span>.</p>
<div class="note status"><b>Status.</b> Sending uses WhatsApp Web in a small window and needs an internet connection; the rest of the POS does not.</div>`,
      },
    ],
  },

  // ============================================================ 14
  {
    n: 14, title: 'Accounts', thumb: 'acc-overview',
    intro: 'Income and expenses, the accounts customers pay into, supplier and customer ledgers, the daily cash count and daily-wage workers.',
    pages: [
      {
        num: '14.1', kicker: 'Accounts', title: 'Accounts overview', shot: 'acc-overview', figW: 168,
        lead: 'Today\'s and this month\'s income, expenses and profit, and what is owed to you and by you.',
        html: `
<ul class="dots">
<li><b>Today</b>: income, expense, profit and net cash.</li>
<li><b>This month</b>: income and expense.</li>
<li><b>Receivables</b> (what customers and parties owe you) and <b>payables</b> (what you owe suppliers), from the party ledgers.</li>
</ul>
<p><span class="ui">Full Report (A4)</span>, <span class="ui">80mm PDF</span> and <span class="ui">Print 80mm</span> produce the accounts report for the period.</p>
<p>The tabs open the parts of Accounts: Payment A/Cs, Income, Expense, Parties, Ledger and Cash Close.</p>
<div class="note">Sales are counted as income automatically. Expenses, other income and payments are entered here.</div>`,
      },
      {
        num: '14.2', kicker: 'Accounts', title: 'Payment accounts', shot: 'acc-payment-accounts', figW: 168,
        lead: 'The bank, JazzCash and Easypaisa accounts customers pay into. They appear on the payment screen under Online and Split.',
        html: `
<ol class="steps">
<li>Press <span class="ui">Add Account</span>.</li>
<li>Choose the type (Bank, JazzCash, Easypaisa, wallet, cash or other), the name, the account or mobile number and the account title.</li>
<li>Save.</li>
</ol>
<p>The list shows how much each account has received from bills. Reports Center can list bills per account (16.6), so you can check the bank statement against the POS.</p>`,
      },
      {
        num: '14.3', kicker: 'Accounts', title: 'Income and expenses', shot: 'acc-expense', figW: 168,
        lead: 'Every payment that is not a sale — rent, bills, groceries, repairs — and any other income.',
        html: `
<ol class="steps">
<li>Open the <span class="ui">Expense</span> (or <span class="ui">Income</span>) tab and press <span class="ui">Add expense</span>.</li>
<li>Enter the date, category, description, amount and how it was paid; link a party if it is a supplier payment.</li>
<li>Save.</li>
</ol>
<p>The tab shows the total for the period and each entry; the bin deletes an entry. Categories such as Rent, Electricity &amp; Gas, Salaries and Grocery keep reports tidy.</p>
<p>Daily wages (14.6) are posted here as expenses automatically.</p>`,
      },
      {
        num: '14.4', kicker: 'Accounts', title: 'Cash close — counting the drawer', shot: 'acc-cash-close', figW: 168,
        lead: 'At the end of the day, compare the cash in the drawer with what the POS expects.',
        html: `
<ol class="steps">
<li>Check the date and type the <b>opening cash</b> (the float).</li>
<li>The POS shows <b>cash sales</b>, other cash income and cash expenses, and the <b>expected cash</b>.</li>
<li>Count the drawer and type the <b>counted cash</b>. The <b>difference</b> shows at once, marked <i>Short</i>, <i>Excess</i> or <i>Balanced</i>.</li>
<li>Add a note and press <span class="ui">Close Day</span>. The count is saved under Recent Closes.</li>
</ol>
<p><b>Pending credit</b> shows bills on credit that are carried forward — they are not deleted.</p>
<div class="note">This is the cash count. The <b>Day Close</b> module (17.1) prints the shift report and clears the day's live list.</div>`,
      },
      {
        num: '14.5', kicker: 'Accounts', title: 'Party master — suppliers and customers', shot: 'acc-parties', figW: 168,
        lead: 'One list of suppliers and account customers, shared by Receiving, Accounts and the ledgers.',
        html: `
<p>Each party shows its phone and address, the number of goods-received notes, transactions and ledger lines, and the <b>balance</b> — <i>we owe</i> (red) or <i>they owe</i> (green).</p>
<ol class="steps">
<li>Press <span class="ui">New Party</span>; choose <b>supplier</b> or <b>customer</b>; enter the name, phone, address and any opening balance.</li>
<li>Record purchases in Receiving and payments in Accounts — the ledger fills itself.</li>
<li>Print a party's ledger with the printer icon.</li>
</ol>
<p>Search across all parties by name, phone or address.</p>`,
      },
      {
        type: 'pair', num: '14.6', kicker: 'Accounts', title: 'Daily wages', figH: 94,
        lead: 'Day-rate workers — helpers, cleaners, loaders — their daily entries, payments, advances and balances.',
        items: [
          { shot: 'acc-wages', figW: 128, caption: '<b>Daily Entries</b>', html: `<p>Per day and worker: the work, rate, days, overtime, bonus, deductions and net. <span class="ui">New Entry</span> adds a day; filter by date or worker. The counters total wages, payments and the outstanding balance.</p><p>The tabs hold <b>Workers</b>, <b>Payments</b> (and advances), <b>Reports</b> and an <b>Audit Log</b> of every change.</p>` },
          { shot: 'acc-wages-ledger', figW: 128, caption: '<b>Worker Ledger</b> — earned, paid and balance.', html: `<p>Pick a worker to see each day earned and each payment, with the running balance and the closing amount due.</p><div class="note">Wages and payments are posted to Accounts automatically as expenses.</div>` },
        ],
      },
    ],
  },

  // ============================================================ 15
  {
    n: 15, title: 'Staff and users', thumb: 'staff-users',
    intro: 'Employees, attendance and payslips; waiters and riders; and the user accounts that decide who can open what.',
    pages: [
      {
        num: '15.1', kicker: 'HR', title: 'Employees', shot: 'staff-hr', figW: 168,
        lead: 'The staff register: code, name, designation, phone, salary and status.',
        html: `
<ol class="steps">
<li>Press <span class="ui">Add</span>.</li>
<li>Enter the employee code, name, father's name, CNIC, phone, designation, department, joining date, basic salary, allowances, address and status.</li>
<li>Save. Edit or delete with the icons.</li>
</ol>
<p>HR has five tabs: <b>Employees</b>, <b>Attendance</b>, <b>Leaves</b>, <b>Payslips</b> and <b>Advances</b> (next page).</p>`,
      },
      {
        type: 'pair', num: '15.2', kicker: 'HR', title: 'Attendance and payslips', figH: 88,
        items: [
          { shot: 'staff-attendance', figW: 128, caption: '<b>Attendance</b> — one tap per employee.', html: `<p>Choose the date and mark each employee <b>P</b> present, <b>A</b> absent, <b>L</b> on leave or <b>H</b> half-day. <b>Leaves</b> records leave requests (casual, sick, annual, unpaid) and their approval.</p>` },
          { shot: 'staff-payslips', figW: 128, caption: '<b>Payslips</b> — for the chosen month.', html: `<p>Pick the month and an employee to generate the payslip: working, present, absent and leave days, basic salary, allowances, overtime, bonus, advance and loan deductions, and the net salary. Saved payslips are listed on the right. <b>Advances</b> records money given ahead of salary.</p>` },
        ],
      },
      {
        num: '15.3', kicker: 'Staff', title: 'Waiters and riders', shot: 'staff-waiters', figW: 160,
        lead: 'The short lists the POS uses for dine-in (waiters) and delivery (riders).',
        html: `
<ul class="dots">
<li>Switch between <span class="ui">Waiters</span> and <span class="ui">Riders</span>; search by name or phone.</li>
<li><span class="ui">Add Waiter</span> (or Add Rider) — name and phone.</li>
<li>Each row shows how many orders the person has served or delivered.</li>
<li><span class="ui">Active</span> switches a person off without deleting their history.</li>
</ul>
<p>Waiters are chosen when a table is seated; riders on the delivery board (8.1).</p>
<div class="note">Waiters and riders do not sign in; they are names on the bills. People who sign in are <b>users</b> (next page).</div>`,
      },
      {
        num: '15.4', kicker: 'Users', title: 'Users and access', shot: 'staff-users', figW: 166,
        lead: 'The people who sign in, their role, how many pages they can open, and whether they have a quick-login PIN.',
        html: `
<ol class="steps">
<li>Press <span class="ui">Add User</span>.</li>
<li>Enter the full name, username, password and role (Admin, Manager, Cashier, Order Taker or Rider).</li>
<li>Review the pages and actions ticked for the role (15.5) and save.</li>
</ol>
<p><b>Pages</b> shows how many of the 58 pages the user can open; <b>PIN</b> marks a quick-login PIN. The pencil edits, the bin deletes.</p>
<div class="note warn"><b>First day.</b> Change the password of the built-in <code>admin</code> account. In the Espresso Orange theme a red line reminds administrators until it is changed.</div>`,
      },
      {
        num: '15.5', kicker: 'Users', title: 'Editing a user and their permissions', shot: 'staff-user-edit', figW: 104,
        lead: 'Each user\'s login details, role and exactly which pages appear in their menu.',
        html: `
<ul class="dots">
<li><b>Full name</b> (printed on bills as the cashier), <b>username</b> and <b>password</b>.</li>
<li><b>Quick login PIN</b> — optional, exactly 4 digits (2.4).</li>
<li><b>Role</b> — choosing a role ticks that role's default pages and actions.</li>
<li><b>Account Active</b> — an inactive user cannot sign in; their history stays.</li>
<li><b>Page Access</b> — tick the pages this user can open, grouped as Operations, Marketing, Inventory, Accounts, Staff, Reports and Admin. <span class="ui">Reset to … defaults</span> restores the role's list.</li>
<li><b>Feature permissions</b> — Billing, Discounts, Inventory, Reports and Admin actions such as Edit Bill, Void, Refund, Apply Discount.</li>
</ul>
<p>Order takers and riders sign in with their <b>phone number and a PIN</b> instead of a username.</p>
<div class="note status"><b>Status.</b> In v1.20.1 the <b>page</b> ticks decide what each user can open. The <b>feature</b> (action) ticks are saved with the user, but the screens do not yet check them: within a page they can open, users can use its buttons. Discount approval is controlled separately in Settings (4.7), and Void / Comp, Bill Editor and Settings are limited to administrators and managers.</div>`,
      },
    ],
  },
];
