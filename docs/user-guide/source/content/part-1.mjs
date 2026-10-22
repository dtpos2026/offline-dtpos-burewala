// Chapters 1–4: Introduction, Getting started, The workspace, Selling at the POS.
export default [
  // ============================================================ 1
  {
    n: 1, title: 'Introduction', thumb: 'ws-dashboard-shell',
    intro: 'What DT POS Enterprise is, who it is for, and how this guide is organised.',
    pages: [
      {
        type: 'text', num: '1.1', kicker: 'Overview', title: 'About DT POS Enterprise',
        lead: 'A complete point-of-sale and back-office system for restaurants, cafés, fast-food outlets and takeaways — installed on a Windows computer and working fully offline.',
        cols: 2,
        html: `
<div class="card tint"><h3>What it does</h3>
<p>DT POS Enterprise runs the whole service day in one program: taking orders at the counter or at the table, sending tickets to the kitchen, printing bills, taking cash, card and online payments, keeping credit (udhaar) accounts, tracking stock and food cost, paying staff and suppliers, and closing the day with a clean report.</p></div>
<div class="card"><h3>Who uses it</h3>
<ul class="dots">
<li><b>Cashiers</b> take orders and payments at the POS screen, retrieve open bills and reprint receipts.</li>
<li><b>Managers</b> look after tables, deliveries, the menu, stock, customers, staff and reports.</li>
<li><b>The owner / administrator</b> sets the restaurant up, manages users and permissions, and closes the day.</li>
<li><b>The kitchen</b> works from printed tickets (KOT) or from the Kitchen Display on a screen or TV.</li>
</ul></div>
<div class="card"><h3>How it works</h3>
<ul class="dots">
<li><b>Offline first.</b> All data is kept on the computer. Billing, printing and reports never wait for the internet.</li>
<li><b>Licensed per computer.</b> A licence key from Digital Target activates the software on each PC.</li>
<li><b>One screen per job.</b> Each module opens from the menu on the left; managers decide which modules each user can see.</li>
<li><b>Thermal printing.</b> 80 mm and 58 mm receipt printers, separate kitchen and token printers, and many receipt designs.</li>
</ul></div>
<div class="card"><h3>Highlights</h3>
<ul class="dots">
<li>Fast billing with keyboard shortcuts, size and weight items, deals, discounts, promo codes and service charge.</li>
<li>Dine-in floor plan with table transfer, merge and split; delivery board and self-pickup.</li>
<li>Kitchen Display and Customer Display for a second screen or TV.</li>
<li>Credit customers with full ledger, partial payments and recovery.</li>
<li>Inventory with recipes, receiving (GRN), wastage and food-cost reports.</li>
<li>Accounts, party ledgers, daily wages, HR, attendance and payslips.</li>
<li>Dashboard and more than fifteen reports, with PDF, Excel and 80 mm print.</li>
<li>Twenty-one built-in looks, including the DT Retail themes, plus your own custom theme.</li>
</ul></div>`,
      },
      {
        type: 'modules', num: '1.2', kicker: 'Overview', title: 'Complete module list', groups: ['Operations'],
        lead: 'Every module of DT POS Enterprise — {total} entries, {available} of them in the Offline Edition. Grouped as in the menu; the last column says which section and page of this guide explains the module.',
      },
      {
        type: 'modules', num: '1.2', toc: false, kicker: 'Overview', title: 'Complete module list — continued', groups: ['Marketing', 'Inventory', 'Accounts', 'Staff'],
        lead: 'Marketing, inventory, accounts and staff.',
      },
      {
        type: 'modules', num: '1.2', toc: false, kicker: 'Overview', title: 'Complete module list — continued', groups: ['Reports', 'Admin'],
        lead: 'Reports and administration.',
        after: `<p style="margin-top:2mm;font-size:8pt;color:#5b5670">Modules marked <b style="color:#b91c1c">online edition only</b> need the internet or a cloud account. In the Offline Edition they are removed from the menu (chapter 20). Which modules each user sees is decided by their role and page access (15.5, Appendix A).</p>`,
      },
      {
        type: 'text', num: '1.3', kicker: 'Overview', title: 'How to read this guide', cols: 2,
        lead: 'Each module has its own page: a picture of the screen taken from the running software, what the screen is for, and step-by-step instructions.',
        html: `
<div class="card"><h3>Conventions</h3>
<ul class="dots">
<li><span class="ui">Bold violet text</span> is a button, tab or field exactly as it is labelled on the screen.</li>
<li><span class="path">Settings → General</span> is a path: open Settings, then the General tab.</li>
<li><kbd>F4</kbd> is a key on the keyboard.</li>
<li><span class="mk">1</span> Numbered yellow circles on a picture match the numbered list beside it.</li>
</ul></div>
<div class="card"><h3>Notes in the margin</h3>
<div class="note tip"><b>Tip.</b> A quicker way, or a habit that saves trouble later.</div>
<div class="note warn"><b>Take care.</b> An action that changes or removes data.</div>
<div class="note status"><b>Status.</b> A feature that is limited, switched off in this edition, or needs the Windows desktop app.</div>
</div>
<div class="card"><h3>About the pictures</h3>
<p>All pictures were captured from DT POS Enterprise v1.20.1 using a fictional <b>Sample Restaurant</b> in Burewala with a month of sample sales. Names, phone numbers and amounts are examples only.</p>
<p>The pictures show the <b>Royal Purple</b> look, the default DT Retail theme. Your screens may use another colour theme (chapter 3.3); the buttons and their places are the same in every theme.</p>
<p>A few screens behave slightly differently in the Windows desktop app than in these pictures, which were taken in a browser window — mainly printer selection and silent printing. Those differences are pointed out where they apply.</p></div>
<div class="card"><h3>Getting help</h3>
<p>Digital Target support: <b>+92 345 1873354</b> (call) · <b>+92 332 2373354</b> (WhatsApp) · <b>digitaltarget.digital@gmail.com</b>. The <span class="ui">Contact Admin</span> link on the sign-in screen opens the same details.</p></div>`,
      },
    ],
  },

  // ============================================================ 2
  {
    n: 2, title: 'Getting started', thumb: 'start-login',
    intro: 'Install, activate and sign in for the first time — and the checklist that makes the first day go smoothly.',
    pages: [
      {
        num: '2.1', kicker: 'First start', title: 'Starting the software', shot: 'start-splash', figW: 170,
        lead: 'DT POS Enterprise is installed on a Windows PC by Digital Target or your dealer. Open it from the desktop shortcut.',
        html: `
<p>Each time the software starts, the splash screen shows the product name, your restaurant's name and the version while the data is loaded from the computer.</p>
<h4>Installing</h4>
<ol class="steps">
<li>Run the DT POS Enterprise setup file supplied by Digital Target.</li>
<li>Connect and switch on the receipt printer (and the kitchen printer, if you have one) before the first start, so Windows lists them.</li>
<li>Start the software. On a new computer the activation screen appears first (next page).</li>
</ol>
<div class="note tip"><b>Tip.</b> Keep the computer's date and time correct. The licence refuses to open if the clock is turned back by more than three hours.</div>
<div class="note">
<b>Data stays on this PC.</b> Orders, menu, customers and settings are saved on the computer itself, so the POS keeps working without internet. Take regular backups (chapter 17).</div>`,
      },
      {
        num: '2.2', kicker: 'First start', title: 'Activating the licence', shot: 'start-activation', figW: 170,
        lead: 'The software runs only on a computer activated with a valid DT POS licence key.',
        html: `
<ol class="steps">
<li>Type the <span class="ui">Business Name</span>, the <span class="ui">Owner Name</span> and the <span class="ui">Mobile Number</span>.</li>
<li>Enter the <span class="ui">License Key</span> exactly as received — it starts with <code>DTPOS-</code>.</li>
<li>Press <span class="ui">Activate License</span>. The sign-in screen opens.</li>
</ol>
<p>The code at the bottom right of the card identifies this computer. Press it to copy it, then send it to Digital Target if support asks for it.</p>
<h4>After activation</h4>
<ul class="dots">
<li>The licence is checked on the computer itself each time the software opens, so it works offline.</li>
<li>When the PC is online, the status is refreshed in the background (for example a renewal or a suspension by Digital Target).</li>
<li>A licence limited to a number of devices refuses extra computers.</li>
</ul>
<div class="note status"><b>Status.</b> Licence keys, renewals and device limits are issued by Digital Target from its own administration console. That console is not part of the restaurant software and is not covered in this guide.</div>`,
      },
      {
        num: '2.3', kicker: 'Sign in', title: 'Signing in with a username and password', shot: 'start-login', figW: 166,
        lead: 'Everyone who uses the POS signs in with their own account, so every bill, discount and change carries their name.',
        legend: [
          '<b>Username</b> — given by the administrator.',
          '<b>Password</b> — the eye icon shows what you typed.',
          '<b>Sign In</b> — or press <kbd>Enter</kbd>.',
          '<b>Sign in with PIN</b> — appears once any user has a quick-login PIN (2.4).',
          '<b>Contact Admin</b> — Digital Target phone, WhatsApp and email.',
        ],
        html: `
<p><b>Remember me</b> (on by default) keeps the username filled in next time.</p>
<p>The first administrator account is created during installation: username <code>admin</code>, password <code>admin123</code>. <b>Change this password on the first day</b> in <span class="path">Users → Edit</span>.</p>
<div class="note">Users are stored on this computer. Signing in never needs the internet.</div>`,
      },
      {
        type: 'pair', num: '2.4', kicker: 'Sign in', title: 'Quick sign-in with a PIN',
        lead: 'A busy counter can switch cashiers in two seconds: tap your name and type a 4-digit PIN. The password always keeps working.',
        figH: 108,
        items: [
          { shot: 'start-login-pin', figH: 108, caption: '<b>Sign in with PIN</b> — tap your name, then the PIN.', html: `
<ol class="steps">
<li>Press <span class="ui">Sign in with PIN</span> under the Sign In button.</li>
<li>Tap your name card. Then type your PIN on the keypad or the keyboard — the fourth digit signs you in.</li>
<li>A user without a PIN is taken to the password form with the username filled in.</li>
</ol>` },
          { shot: 'start-login-espresso', figH: 80, caption: '<b>Espresso Orange</b> look — the PIN page is the sign-in page.', html: `
<p>The PIN is set per user in <span class="path">Users → Edit user → Quick login PIN</span> (chapter 15.5). No one gets a PIN automatically.</p>
<div class="note warn"><b>Safety.</b> After five wrong PINs, that user's PIN sign-in is locked for one minute. The password still works.</div>
<p>In the Espresso Orange theme the sign-in page opens on the PIN cards and shows a reminder while the factory admin password is still in use.</p>` },
        ],
      },
      {
        num: '2.5', kicker: 'Sign in', title: 'Support details — Contact Admin', shot: 'start-contact', figW: 96, oneCol: true,
        lead: 'Help is one click away on the sign-in screen, before anyone has signed in.',
        html: `
<p>The <span class="ui">Contact Admin</span> link opens Digital Target's contact card:</p>
<ul class="dots">
<li><b>WhatsApp Chat</b> — opens a chat with a message already written ("I would like to get an account for DT POS…").</li>
<li><b>Call Now</b> — dials the support number; <span class="ui">Copy</span> copies it.</li>
<li><b>Email</b> — opens a new email to Digital Target; <span class="ui">Copy</span> copies the address.</li>
</ul>
<p>Use it to request an account, a demo or support. The same details are in Appendix C.</p>`,
      },
      {
        type: 'text', num: '2.6', kicker: 'Checklist', title: 'Your first day: set-up checklist', cols: 3,
        lead: 'Work through these steps once, as the administrator, before the first customer arrives. Each step points to the chapter with the details.',
        html: `
<div class="card tint"><h3>1 · Restaurant details</h3><p><span class="path">Settings → General</span>: name, address, phones, currency, tax, service charge and discount buttons. These print on every bill. <i>(18.1)</i></p></div>
<div class="card tint"><h3>2 · Printers</h3><p><span class="path">Printers &amp; Print Server</span>: add the receipt printer and the kitchen printer, map them to roles, then print a test slip. <i>(19)</i></p></div>
<div class="card tint"><h3>3 · Menu</h3><p><span class="path">Menu</span>: add categories and items, or import your whole menu from Excel. Set sizes for pizzas and per-kg rates for weight items. <i>(11)</i></p></div>
<div class="card tint"><h3>4 · Tables</h3><p><span class="path">Settings → Tables</span>: add floors, tables and kitchens (stations). Add waiters under <span class="path">Settings → Waiters</span>. <i>(18.5)</i></p></div>
<div class="card tint"><h3>5 · Users</h3><p><span class="path">Users</span>: create an account for each cashier and manager, choose what each can open, and change the admin password. <i>(15.4)</i></p></div>
<div class="card tint"><h3>6 · Payment accounts</h3><p><span class="path">Accounts → Payment A/Cs</span>: add the bank, JazzCash and Easypaisa accounts customers pay into, so Online and Split payments work. <i>(14.2)</i></p></div>
<div class="card tint"><h3>7 · A test bill</h3><p>On the <span class="path">POS</span>, ring up a test order, pay it and check the receipt and kitchen slip. Void it afterwards in <span class="path">Void / Comp / Cancel</span>. <i>(4, 10)</i></p></div>
<div class="card tint"><h3>8 · Look and layout</h3><p><span class="path">Settings → Appearance</span> and <span class="path">Screen &amp; Layout</span>: pick a theme and the POS layout for this screen. <i>(18.3–18.4)</i></p></div>
<div class="card tint"><h3>9 · End of day</h3><p>Agree who closes the day and how: <span class="path">Day Close</span> prints the shift report and clears the day's live list; <span class="path">Backup</span> exports a copy of all data. <i>(17)</i></p></div>`,
      },
    ],
  },

  // ============================================================ 3
  {
    n: 3, title: 'The workspace', thumb: 'ws-launcher',
    intro: 'The parts of the screen that are the same everywhere: the menu, the top bar, the module search, looks and user roles.',
    pages: [
      {
        num: '3.1', kicker: 'Workspace', title: 'The main screen', shot: 'ws-dashboard-shell', figW: 178,
        lead: 'Every module opens inside the same frame: the menu on the left, a top bar with the live status, and the module in the middle.',
        legend: [
          '<b>Main menu</b> — the everyday modules, <span class="ui">More</span> with every other module, and <span class="ui">Settings</span> at the foot.',
          '<b>Page title</b> — the module you are in. The button to its left folds the menu.',
          '<b>Module search</b> — jump to any module by name (also on page 3.2).',
          '<b>Status</b> — connection, <span class="ui">Check Setup</span> (printer readiness), version and notifications; then the clock and text size <kbd>T</kbd>.',
          '<b>Signed-in user</b> — name and role, and the <b>log-out</b> button.',
          '<b>Powered by Digital Target</b> — support contacts.',
        ],
        html: `<div class="note tip"><b>Tip.</b> The text-size button <kbd>T</kbd> makes everything larger or smaller for this screen — useful on a small or very large monitor.</div>`,
      },
      {
        num: '3.2', kicker: 'Workspace', title: 'Finding any module — More', shot: 'ws-launcher', figW: 150,
        lead: 'The menu shows the modules used every day. Everything else is one click away under More, grouped the same way as in this guide.',
        html: `
<ol class="steps">
<li>Press <span class="ui">More</span> at the bottom of the menu, or the search icon in the top bar.</li>
<li>Type part of a name — for example <code>credit</code> or <code>report</code> — or scroll the groups.</li>
<li>Click a module to open it.</li>
</ol>
<p><b>Star</b> a module to pin it under Favorites in the menu. <span class="ui">Manage modules</span> opens <span class="path">Settings → Modules</span>, where the administrator chooses what appears in the menu, under More, or nowhere (18.4).</p>
<p>Each user sees only the modules their account allows (15.4). The count beside More shows how many modules it holds.</p>`,
      },
      {
        type: 'quad', num: '3.3', kicker: 'Workspace', title: 'Looks and themes',
        lead: 'The same software in four of its looks. A theme changes colours and style only — never the data, the bills or the printing. Each computer keeps its own choice.',
        items: [
          { shot: 'look-classic-pos', caption: '<b>Classic</b> — the full menu of earlier versions.' },
          { shot: 'look-espresso-pos', caption: '<b>Espresso Orange</b> (DT Retail) — with the default-password reminder.' },
          { shot: 'look-night-dashboard', caption: '<b>Night</b> (DT Retail) — a dark page for dim shops.' },
          { shot: 'look-ember-dashboard', caption: '<b>Ember</b> (Modern) — light page, short menu.' },
        ],
        html: `<p style="margin-top:3mm">Change the look in <span class="path">Settings → Appearance</span>: <b>Modern</b> (13 food-colour themes), <b>DT Retail</b> (8 themes with a gradient menu and motion) or <b>Classic</b>, plus <b>Custom</b> themes you design yourself (18.3).</p>`,
      },
      {
        num: '3.4', kicker: 'Workspace', title: 'What a cashier sees', shot: 'role-cashier-pos', figW: 160,
        lead: 'Users see only what their role and permissions allow. Here, the same POS signed in as a cashier.',
        html: `
<p>Compared with the administrator, the cashier's menu has no Menu, Inventory, Customers, Reports or Settings, and <span class="ui">More</span> holds only 8 modules.</p>
<h4>The five roles</h4>
<ul class="dots">
<li><b>Admin</b> — everything, always.</li>
<li><b>Manager</b> — daily operations, menu, stock, customers, accounts, staff and reports.</li>
<li><b>Cashier</b> — POS, tables, open bills, kitchen, delivery, pickup, credits and reprints.</li>
<li><b>Order taker</b> — POS, tables and open bills; sends orders to the kitchen but does not take payment.</li>
<li><b>Rider</b> — the rider app (online edition only).</li>
</ul>
<p>The administrator can tick extra pages and actions for any single user (15.5). The full default list is in Appendix B.</p>`,
      },
    ],
  },

  // ============================================================ 4
  {
    n: 4, title: 'Selling at the POS', thumb: 'pos-main',
    intro: 'The sale screen: choosing the order type, adding items, discounts, taking payment and printing — the work of every shift.',
    pages: [
      {
        num: '4.1', kicker: 'POS', title: 'Choosing the order type', shot: 'pos-gate', figW: 120,
        lead: 'When the POS opens it asks what kind of order you are starting, so the bill, the kitchen ticket and the reports are right from the first item.',
        html: `
<ul class="dots">
<li><b>Dine-In</b> — the table and waiter are asked for when you save or pay (4.6).</li>
<li><b>Takeaway</b> — customer name and phone are optional.</li>
<li><b>Delivery</b> — the customer's name, phone and address are asked for (4.6). A delivery charge can be added in Settings.</li>
</ul>
<p>You can change the order type later with the three tabs at the top of the bill. Close the box with <b>×</b> to open another module instead.</p>
<p><b>Foodpanda</b> appears as a fourth type when Foodpanda mode is on (<span class="path">Settings → Self-Pickup</span>, chapter 8.3).</p>
<div class="note">This question can be switched off in <span class="path">Settings → Self-Pickup → "Select Order Type" Prompt</span>; items can then be added straight away.</div>`,
      },
      {
        num: '4.2', kicker: 'POS', title: 'The sale screen', shot: 'pos-main', figW: 178,
        lead: 'Items on the left, categories in the middle, the bill on the right. Tap an item to add it; tap again to add one more.',
        legend: [
          '<b>Search</b> — type part of an item name (<kbd>F1</kbd> or <kbd>Ctrl</kbd>+<kbd>K</kbd>). <span class="ui">Manual</span> adds an item that is not on the menu.',
          '<b>Categories</b> — tap one to show its items; the grid button shows them all (4.4).',
          '<b>Item tiles</b> — name, price and, once added, the quantity badge.',
          '<b>Order type</b> — Dining, Takeaway or Delivery.',
          '<b>Bill lines</b> — change quantities with − and +, remove with the bin.',
          '<b>Totals</b> — discount, promo code, service charge, total, payment and change (4.7).',
          '<b>PAY</b> — opens the payment screen (4.8).',
          '<b>Kitchen</b> and <b>Customer Receipt</b> — preview and print the kitchen slip or the bill.',
        ],
        html: `<div class="note tip"><b>Tip.</b> The layout — category panel on the right, left or top, number of columns, cart width — is set per screen in <span class="path">Settings → Screen &amp; Layout</span>.</div>`,
      },
      {
        num: '4.3', kicker: 'POS', title: 'The bill, step by step', shot: 'pos-cart', figW: 76,
        lead: 'The bill panel holds every action for the current order. Each numbered part is explained here.',
        legend: [
          '<b>Order type</b> — Dining / Takeaway / Delivery. Locked while an existing bill is being edited.',
          '<b>Customer</b> — name and phone. Typing suggests saved customers; the bill then appears in their history and loyalty.',
          '<b>Lines</b> — item, quantity, line total. Tap a line to select it for the keypad.',
          '<b>Totals</b> — preset discount buttons (−5% … −200), <b>Discount</b> in Rs or %, <b>Promo</b> code, <b>Service</b> charge (<span class="ui">+ Add</span>), <b>Total</b>, then <b>Payment</b> received and <b>Change</b>. The <b>Keypad</b> below enters quantities, prices or cash.',
          '<b>Hold</b> (<kbd>F2</kbd>) — parks the order unpaid, for example for a customer who will come back. <b>CLR</b> empties the bill.',
          '<b>PAY</b> (<kbd>F4</kbd> or <kbd>Enter</kbd>) — opens the payment screen.',
          '<b>Kitchen</b> — saves the order as running and shows the kitchen slip. <b>Customer Receipt</b> — shows the bill to print or hand over.',
          '<b>Running</b> (<kbd>F3</kbd>) — saves the order as open (sent to the kitchen) without payment. When editing an existing bill this reads <b>Update</b>.',
          '<b>More actions</b> — Credit (udhaar), Void, Cancel Edit, and the cart width.',
        ],
        html: `
<h4>A typical takeaway</h4>
<ol class="steps">
<li>Choose <span class="ui">Takeaway</span>, tap the items, adjust quantities.</li>
<li>Apply a discount or promo code if needed.</li>
<li>Press <span class="ui">PAY</span>, enter the cash received and press <kbd>Enter</kbd>.</li>
</ol>
<h4>A typical dine-in</h4>
<ol class="steps">
<li>Choose <span class="ui">Dining</span>, add the items, press <span class="ui">Running</span>. Pick the table and waiter; the kitchen ticket prints.</li>
<li>Later, add more items to the same table from <span class="path">Tables</span> or <span class="path">Retrieve</span> and press <span class="ui">Update</span> — only the new items go to the kitchen.</li>
<li>When the guests ask for the bill, open it again and press <span class="ui">PAY</span>.</li>
</ol>
<div class="note tip"><b>Tip.</b> <kbd>+</kbd> on the keyboard pays the bill in cash at once and prints it — the fastest way for a queue.</div>`,
      },
      {
        type: 'pair', num: '4.4', kicker: 'POS', title: 'Items with sizes and the category grid',
        figH: 70,
        items: [
          { shot: 'pos-variant', caption: '<b>Choose a size</b> — shown for items priced by size or inch.', html: `<p>Pizzas and other items with sizes ask which size to add. Each size has its own price, set in the menu (11.2). The bill line and the kitchen slip show the size, for example <i>Chicken Fajita Pizza – Medium</i>.</p><p>Tiles of such items show the lowest price as <b>From Rs.750</b>.</p>` },
          { shot: 'pos-category-grid', caption: '<b>All categories</b> — the grid button next to All.', html: `<p>Shows every category as a box with its picture or icon and the number of items. Pick one to show only its items, or <b>All items</b> to show everything. Useful when there are more categories than fit in the panel.</p>` },
        ],
      },
      {
        num: '4.5', kicker: 'POS', title: 'Items sold by weight', shot: 'pos-weight', figW: 170,
        lead: 'Items priced per kilogram open a panel at the side: sell by weight, or by the amount the customer wants to spend.',
        html: `
<ol class="steps">
<li>Tap the weight item (here <i>Mutton Karahi, Rs 3,600 per kg</i>).</li>
<li><b>By weight (kg):</b> tap a preset (0.25, 0.5, 1, 1.5, 2, 5 kg) or type the weight. Switch the unit to <b>gram</b> or <b>pao</b> if you prefer.</li>
<li><b>By amount (Rs.):</b> type the amount, e.g. Rs 500 — the bill line is exactly Rs 500 and the weight it buys is shown.</li>
<li>Press <span class="ui">Add to cart</span> or <kbd>Enter</kbd>. <kbd>Esc</kbd> closes the panel.</li>
</ol>
<p>With a scale connected to the PC, <span class="ui">Connect scale · F9</span> reads the weight straight into the panel.</p>
<div class="note status"><b>Status.</b> Reading a scale over a COM port needs the Windows desktop app. The presets and the panel itself can be switched off in <span class="path">Settings → General → Weight items</span>.</div>`,
      },
      {
        type: 'pair', num: '4.6', kicker: 'POS', title: 'Dine-in table and delivery details',
        figH: 96,
        items: [
          { shot: 'pos-dining-dialog', caption: '<b>Select Table &amp; Waiter</b>', html: `<p>Asked the first time a dine-in order is saved. The list shows the tables that are free. The waiter is optional. The table is then marked <b>Running</b> on the Tables screen (5.1).</p><p>Starting the order from <span class="path">Tables</span> skips this question — the table is already chosen.</p>` },
          { shot: 'pos-delivery-dialog', caption: '<b>Customer &amp; Delivery Details</b> — with suggestions.', html: `<p>Type a few letters of the name or phone: saved customers are suggested with their order count, spend and grade. Picking one fills the phone and address. New customers are saved automatically with the order.</p>` },
        ],
      },
      {
        type: 'text', num: '4.7', kicker: 'POS', title: 'Discounts, promo codes, service charge and tax', cols: 3,
        lead: 'How the total is worked out, and who may change each part.',
        html: `
<div class="card"><h3>Discount</h3>
<p>Tap a preset (<b>−5%</b>, <b>−10%</b>, <b>−15%</b>, <b>−100</b>, <b>−200</b>) or type an amount with <b>Rs</b> or <b>%</b> selected. The presets are set in <span class="path">Settings → General → Quick Discount</span>.</p>
<p>A percentage discount prints with its rate, e.g. <i>Discount (10%) 285</i>. Categories can be excluded from discounts.</p>
<p>If <b>Cashier discount requires approval</b> is on, cashiers cannot discount; the bill goes to the Bill Editor for an admin (10.2).</p></div>
<div class="card"><h3>Event discount</h3>
<p>An automatic discount for every bill — for example during Ramadan — set in <span class="path">Settings → General</span>. It applies before manual discounts and promo codes; together they can never exceed the bill.</p>
<h3 style="margin-top:3mm">Promo code</h3>
<p>Type the code (e.g. <code>WELCOME10</code>) and press <span class="ui">Apply</span>. The code's dates, minimum order and usage limit are checked (13.5).</p></div>
<div class="card"><h3>Service charge</h3>
<p>Added automatically for the order types switched on in <span class="path">Settings → General → Service charge</span> — as a percentage or a fixed amount. It is worked out after any discount.</p>
<p>With <b>Allow adding or editing it on a bill</b> on, <span class="ui">+ Add</span> beside Service lets the cashier add, change or remove it for one bill.</p></div>
<div class="card"><h3>Tax (GST / VAT)</h3>
<p>Set <b>GST / VAT %</b> in <span class="path">Settings → General</span>. <i>Exclusive</i> adds it on top of the total; <i>inclusive</i> shows it inside the price. Service charge is added first, then tax. 0 switches tax off.</p></div>
<div class="card"><h3>Delivery charge and rounding</h3>
<p>A flat delivery charge is added to delivery orders. Cash rounding (optional) rounds the total to the nearest note and prints the adjustment.</p></div>
<div class="card tint"><h3>Example</h3>
<p>Items 2,850 − 10% discount (285) = 2,565<br>+ 10% service charge (257)<br><b>= Total 2,822</b></p>
<p style="font-size:8pt">Every part prints on the receipt only when it is used.</p></div>`,
      },
      {
        num: '4.8', kicker: 'POS', title: 'Taking payment', shot: 'pos-payment', figW: 138,
        lead: 'The payment screen opens on PAY. Enter what the customer gives you; the change and any amount still due are shown at once.',
        legend: [
          '<b>Total Payable</b> — the bill total.',
          '<b>Method</b> — <b>Cash</b>, <b>Online</b> (bank / JazzCash / Easypaisa account), <b>Split</b> (part cash, part online) or <b>Other</b> types you add.',
          '<b>Print receipt</b> — untick to skip the receipt for this one bill.',
          '<b>Amount Received</b> — type it or use the keypad.',
          '<b>Exact</b> and the next round notes — one tap fills the amount.',
          '<b>Change</b> and <b>Due (Credit)</b> — what to give back, or what is still owed.',
          '<b>Complete Sale</b> (<kbd>Enter</kbd>) — saves the payment and prints.',
        ],
        html: `
<p>Paying <b>less</b> than the total makes a <b>partial payment</b>: the button reads <i>Partial Pay · Rs. 1,000 (Due Rs. 1,140)</i>. The rest is collected later from <span class="path">Pending Payments</span> (6.2).</p>
<p>Online and Split need at least one payment account (14.2). <span class="ui">Back to cart</span> returns to the bill.</p>
<div class="note">Prefer the earlier compact popup? Choose <b>Classic</b> in <span class="path">Settings → General → Payment screen</span>.</div>`,
      },
      {
        type: 'pair', num: '4.9', kicker: 'POS', title: 'The receipt and the kitchen slip',
        figH: 132,
        items: [
          { shot: 'pos-receipt', figH: 132, caption: '<b>Customer receipt</b> after payment (on-screen preview).', html: `<p>The receipt shows the restaurant header, items with rates, totals, the amount in words, the payment breakdown and a QR code. The design is chosen in <span class="path">Printers → Receipt design</span> (19.5).</p>` },
          { shot: 'pos-kitchen-slip', figH: 112, caption: '<b>Kitchen slip (KOT)</b> — what the cook sees.', html: `<p>The KOT prints when an order is saved as running (or paid). It lists items and quantities in large type, without prices. When a running bill is updated, the next KOT lists only the changes.</p><p>Whether the receipt and KOT print, and on which printer, is set in <span class="path">Settings → KOT Settings</span> (18.9).</p>` },
        ],
      },
      {
        type: 'pair', num: '4.10', kicker: 'POS', title: 'More actions: credit, void and manual items',
        figH: 104,
        items: [
          { shot: 'pos-more-menu', figH: 116, caption: '<b>More actions</b> (⋮ beside Running).', html: `<ul class="dots"><li><b>💳 Credit</b> — saves the bill on credit (udhaar) for a named customer.</li><li><b>Void</b> — voids the bill, with a reason; it moves to Void / Comp / Cancel.</li><li><b>✕ Cancel Edit</b> — leaves an edited bill unchanged.</li><li><b>Cart width</b> — narrower or wider bill panel.</li></ul>` },
          { shot: 'pos-credit', figH: 60, caption: '<b>Credit (udhaar)</b> — name, phone and address.', html: `<p>The bill is saved as <b>credit pending</b> and appears in <span class="path">Credits</span> and the customer's ledger until it is paid (chapter 9).</p>` },
          { shot: 'pos-manual-item', figH: 42, caption: '<b>Manual item</b> — the Manual button.', html: `<p>Adds a one-off item with any name and price, for example a special request. It prints and reports like any other line.</p>` },
        ],
      },
      {
        type: 'text', num: '4.11', kicker: 'POS', title: 'Keyboard shortcuts at the POS', cols: 2,
        lead: 'Experienced cashiers bill without touching the mouse. The shortcuts are also listed at the foot of the bill panel.',
        html: `
<table class="t"><thead><tr><th>Key</th><th>What it does</th></tr></thead><tbody>
<tr><td><kbd>F1</kbd> · <kbd>Ctrl</kbd>+<kbd>K</kbd></td><td>Jump to the item search box</td></tr>
<tr><td><kbd>F2</kbd></td><td>Hold the current order (unpaid)</td></tr>
<tr><td><kbd>F3</kbd></td><td>Save as Running (or Update an open bill)</td></tr>
<tr><td><kbd>F4</kbd></td><td>Open the payment screen</td></tr>
<tr><td><kbd>Enter</kbd></td><td>Apply the keypad value; with nothing typed, open the payment screen</td></tr>
<tr><td><kbd>+</kbd></td><td>Pay in cash at once and print (instant paid bill)</td></tr>
<tr><td><kbd>F8</kbd></td><td>Show the last bill again to reprint it</td></tr>
<tr><td><kbd>Esc</kbd></td><td>Clear the keypad / close the weight panel</td></tr>
<tr><td><kbd>F9</kbd></td><td>Read the weighing scale (weight items, desktop app)</td></tr>
</tbody></table>
<div class="card tint" style="margin-top:0">
<h3>In the payment screen</h3>
<ul class="dots"><li>Type the amount, then <kbd>Enter</kbd> to complete the sale.</li><li><kbd>Esc</kbd> returns to the cart.</li></ul>
<h3>In the weight panel</h3>
<ul class="dots"><li>Digits and <kbd>.</kbd> type the weight or amount; <kbd>Backspace</kbd> deletes.</li><li><kbd>Enter</kbd> or <kbd>+</kbd> adds to the cart; <kbd>Esc</kbd> closes.</li></ul>
<h3>On the PIN sign-in</h3>
<ul class="dots"><li>Digits type the PIN; <kbd>Backspace</kbd> deletes; <kbd>Esc</kbd> clears.</li></ul>
</div>`,
      },
    ],
  },
];
