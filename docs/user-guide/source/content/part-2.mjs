// Chapters 5–10: Tables, Open bills, Kitchen & displays, Delivery & pickup, Credit, Corrections & audit.
export default [
  // ============================================================ 5
  {
    n: 5, title: 'Tables and dine-in', thumb: 'tables-grid',
    intro: 'The dining room at a glance: which tables are free, which are eating, how long they have been seated, and every action for a table bill.',
    pages: [
      {
        num: '5.1', kicker: 'Tables', title: 'The tables screen', shot: 'tables-grid', figW: 170,
        lead: 'Each table is a card in the colour of its state. Running tables show the bill number, the amount so far and how long the guests have been seated.',
        legend: [
          '<b>Grid</b> or <b>Floor Map</b> view.',
          '<b>Floors</b> — all floors, or one floor / section (e.g. Ground Floor, Family Hall).',
          '<b>QR codes</b> — all table QRs, and the Takeaway / Delivery QR (5.4).',
        ],
        html: `
<h4>Colours</h4>
<ul class="dots">
<li><b style="color:#0f8a5f">Available</b> — free, ready to seat.</li>
<li><b style="color:#b45309">Running</b> — an order is open.</li>
<li><b style="color:#b91c1c">Pending Payment</b> — bill asked for, waiting to pay.</li>
<li><b>Closed</b> — not in use today.</li>
</ul>
<p>The counters at the top right show how many tables are available and running. Click a table to open its actions (5.3).</p>
<p>Tables, floors, seats and shapes are set up in <span class="path">Settings → Tables</span> (18.5).</p>`,
      },
      {
        num: '5.2', kicker: 'Tables', title: 'The floor map', shot: 'tables-floormap', figW: 170,
        lead: 'The same tables drawn as your room. Drag a table to where it stands — the layout is saved automatically.',
        html: `
<ol class="steps">
<li>Press <span class="ui">Floor Map</span>.</li>
<li>Choose a floor if you have more than one.</li>
<li>Drag each table into place. Positions save as you go.</li>
</ol>
<p>Running tables show the minutes since the guests sat down, so a waiter can see at a glance which table has waited longest.</p>
<div class="note tip"><b>Tip.</b> Square, round and rectangle shapes and the number of chairs come from <span class="path">Settings → Tables</span>; they help staff recognise the table on the map.</div>`,
      },
      {
        type: 'pair', num: '5.3', kicker: 'Tables', title: 'Working with a table', figH: 100,
        items: [
          { shot: 'tables-running-dialog', figH: 112, caption: '<b>A running table</b> — T-2 with order #1684.', html: `
<ul class="dots">
<li><b>Edit / Add Items</b> — opens the bill on the POS. Press Update to send the new items to the kitchen.</li>
<li><b>Print Receipt (this bill)</b> — a bill for the guests before they pay.</li>
<li><b>Transfer</b> — move the bill to a free table. <b>Merge</b> — combine with another running table. <b>Split</b> — move chosen items to a new bill.</li>
<li><b>Mark Pending Payment</b> — the table turns red until paid.</li>
<li><b>Payment &amp; Free Table</b> — pay and free the table in one step.</li>
</ul>` },
          { shot: 'tables-free-dialog', figH: 112, caption: '<b>A free table</b> — seat guests and start.', html: `
<ol class="steps">
<li>Pick how many persons are seated (or use − / +).</li>
<li>Press <span class="ui">Seat … Guests &amp; Start Order</span>. The POS opens with the table chosen.</li>
</ol>
<p><b>View Dine History</b> lists past sittings at the table with their duration. <b>Cancel / Free Table</b> frees a table that was seated by mistake.</p>` },
        ],
      },
      {
        num: '5.4', kicker: 'Tables', title: 'Table QR codes', shot: 'tables-qr', figW: 150,
        lead: 'A printable QR code for every table, and one each for takeaway and home delivery.',
        html: `
<p>Press <span class="ui">All Table QRs</span> on the Tables screen. Each code can be downloaded as a PNG or printed; <span class="ui">Print All</span> prints the whole set for table stands.</p>
<p>The code carries the table and floor name, so an order placed from it arrives already linked to the table.</p>
<div class="note status"><b>Status — Offline Edition.</b> The QR codes open the online ordering page. In the Offline Edition that page is not published on the internet, so customers' phones cannot open it. Use the QR codes only with the online edition from Digital Target.</div>`,
      },
    ],
  },

  // ============================================================ 6
  {
    n: 6, title: 'Open bills and reprints', thumb: 'bills-retrieve',
    intro: 'Finding a bill that is still open, collecting the rest of a part-paid bill, and reprinting old bills safely.',
    pages: [
      {
        num: '6.1', kicker: 'Retrieve', title: 'Retrieve — open bills', shot: 'bills-retrieve', figW: 172,
        lead: 'Every bill that is not yet paid: running tables, held orders, deliveries and part-paid bills — with Pay and Edit on each card.',
        html: `
<ol class="steps">
<li>Filter with <span class="ui">All</span>, <span class="ui">Running</span>, <span class="ui">On hold</span> or <span class="ui">Part paid</span>, or search by bill number, table or customer.</li>
<li><span class="ui">Pay</span> opens the payment screen for that bill.</li>
<li><span class="ui">Edit</span> opens it on the POS to add or change items.</li>
<li><b>⋯</b> holds more: view, edit history, reprint the KOT (or send it to the kitchen), tandoor token, hold / resume and cancel.</li>
</ol>
<p>Each card shows the table and waiter, or the customer and rider, the number of items, the cashier and the amount.</p>
<p>An administrator sees every cashier's bills (<i>All cashiers</i>); a cashier signed in sees <i>their own bills</i>.</p>`,
      },
      {
        num: '6.2', kicker: 'Payments', title: 'Pending payments — part-paid bills', shot: 'pay-pending', figW: 168,
        lead: 'Bills where the customer paid only part of the total. The rest is collected here.',
        html: `
<p>The top cards show how many bills are waiting, how much was received and how much is still due.</p>
<ol class="steps">
<li>Find the bill (search by number, customer or table).</li>
<li>Press <span class="ui">Receive Rs …</span> and take the remaining amount in cash or online.</li>
<li>The bill becomes <b>paid</b> and leaves this list.</li>
</ol>
<p>Each card lists the payments already made, with method and amount. <span class="ui">View</span> shows the bill; <span class="ui">Reprint</span> prints it again.</p>
<div class="note">Bills put on <b>credit (udhaar)</b> are kept separately, under Credits (chapter 9).</div>`,
      },
      {
        num: '6.3', kicker: 'Reprint', title: 'Bill reprint (read-only)', shot: 'bill-reprint', figW: 168,
        lead: 'Find any bill and print it again — without being able to change it. Every reprint is recorded.',
        html: `
<ul class="dots">
<li>Search by bill number, receipt reference, customer, phone or table.</li>
<li>Filter by state: Paid, Partial, Running, Foodpanda, Void, Cancelled.</li>
<li><span class="ui">View</span> shows the bill; <span class="ui">Reprint</span> prints it.</li>
<li><span class="ui">Reprint History</span> lists who reprinted which bill and when.</li>
</ul>
<div class="note tip"><b>Why read-only?</b> A cashier can give a customer a copy of an old bill but cannot alter it. Changes are made only in the Bill Editor by a manager or admin (10.2), where they are logged.</div>`,
      },
    ],
  },

  // ============================================================ 7
  {
    n: 7, title: 'Kitchen and customer displays', thumb: 'kitchen-tv',
    intro: 'Screens for the kitchen and for the customer: live tickets with timers, a TV board for the cooks, and an order-status screen for the counter.',
    pages: [
      {
        num: '7.1', kicker: 'Kitchen', title: 'Kitchen display', shot: 'kitchen-display', figW: 172,
        lead: 'Every order sent to the kitchen, as a ticket with a running timer. Cooks mark items ready; delays turn red.',
        html: `
<ul class="dots">
<li><b>Counters</b>: pending tickets, completed today, average preparation time and delayed tickets.</li>
<li><b>Kitchens</b>: show all kitchens, or one station (Main Kitchen, BBQ Counter, Beverages…).</li>
<li><b>Timer colours</b>: under 5 minutes <i>preparing</i>, 5–10 minutes <i>in progress</i>, over 10 minutes <i>delayed</i>.</li>
<li><span class="ui">Ready</span> on a ticket marks it ready; the counter is told.</li>
</ul>
<p>The speaker button turns sound alerts on or off; the expand button goes full screen.</p>
<p>The minutes for the colours are set in <span class="path">Settings → KOT Settings</span>. Which kitchen prepares each item is set on the item in the Menu (11.2).</p>`,
      },
      {
        num: '7.2', kicker: 'Kitchen', title: 'TV Mode and display settings', shot: 'kitchen-display-center', figW: 160,
        lead: 'TV Mode chooses what the kitchen screen shows and opens it on a second monitor or TV.',
        html: `
<ol class="steps">
<li>On the Kitchen screen press <span class="ui">TV Mode</span>.</li>
<li>Choose <span class="ui">Kitchen board</span> (for the cooks) or <span class="ui">Customer display</span> (for the counter).</li>
<li>Pick a <b>design</b> — Clean, Modern, Premium, Compact, Large Order, Colourful or Fast Kitchen — or <b>Match the screen automatically</b>. The preview shows the result.</li>
<li>Set how many ticket columns fit across the board (0 = automatic).</li>
</ol>
<div class="note status"><b>Status.</b> Choosing which monitor the board opens on needs the Windows desktop app. In a browser the display opens in a new tab that you move to the screen yourself.</div>`,
      },
      {
        num: '7.3', kicker: 'Kitchen', title: 'The kitchen TV board', shot: 'kitchen-tv', figW: 186,
        lead: 'A full-screen board for the kitchen wall, readable from across the room.',
        html: `
<p>Tickets move through the columns <b>New → Preparing → Ready</b>, with separate <b>Delivery</b> and <b>Completed</b> columns. Cooks tap <span class="ui">Tap to accept</span> and <span class="ui">Tap when ready</span> on a touch screen. The top line counts active, pending, cooking and delayed tickets.</p>`,
      },
      {
        num: '7.4', kicker: 'Displays', title: 'Customer display', shot: 'display-customer', figW: 172,
        lead: 'An order-status screen for customers waiting at the counter, on a second monitor or TV.',
        html: `
<ul class="dots">
<li><b>Now Serving</b> — orders that are ready, highlighted.</li>
<li>Below — every open order with its type, table and status (Preparing, Ready).</li>
<li>While the cashier rings up a bill, the screen can show the customer's items and total live — no cashier, waiter or kitchen details are ever shown.</li>
</ul>
<p>Switch it on and choose what it shows in <span class="path">Settings → Display</span> (18.12). Promotional images can play as a slideshow when there is no order.</p>`,
      },
    ],
  },

  // ============================================================ 8
  {
    n: 8, title: 'Delivery, pickup and Foodpanda', thumb: 'delivery-board',
    intro: 'Running home deliveries from the counter, handing over self-pickup orders, and keeping Foodpanda orders apart from your own.',
    pages: [
      {
        num: '8.1', kicker: 'Delivery', title: 'Delivery board', shot: 'delivery-board', figW: 172,
        lead: 'Every delivery order on one board, moving from Pending to Delivered. Assign a rider and keep the customer informed by WhatsApp.',
        html: `
<h4>Columns</h4>
<p><b>Pending → Preparing → Ready → Dispatched → Delivered</b>, plus <b>Cancelled</b>.</p>
<h4>On each card</h4>
<ul class="dots">
<li><b>Assign rider</b> — pick from the riders list (15.3).</li>
<li><b>Status</b> — sends the customer a WhatsApp message with the order's current stage.</li>
<li><b>Tracking</b> — sends the stage, rider name and phone, and the total by WhatsApp.</li>
<li><b>PAY</b> — take payment for the order.</li>
<li><b>Preparing · Ready · Dispatched · Delivered · Cancel</b> — move the order on.</li>
</ul>
<p>The badge shows where the order came from (POS, website or order taker).</p>
<div class="note status"><b>Status.</b> WhatsApp messages open WhatsApp Web with the text filled in; you press Send. Live rider maps belong to the online edition.</div>`,
      },
      {
        num: '8.2', kicker: 'Pickup', title: 'Pickup orders', shot: 'pickup-orders', figW: 172,
        lead: 'Takeaway orders the customer will collect: what is waiting, what is ready, and the hand-over.',
        html: `
<p>The counters show orders and amounts awaiting pickup, and those collected recently.</p>
<ol class="steps">
<li>When the food is ready, press <span class="ui">Ready msg</span> to tell the customer by WhatsApp.</li>
<li>When the customer arrives, press <span class="ui">Pay &amp; Print</span>. The order moves to <b>Collected</b>.</li>
</ol>
<p>Each card shows the customer, phone, the time placed and, when a time was chosen, when it will be ready.</p>
<p>The ready message and the pickup time slots are set in <span class="path">Settings → Self-Pickup</span>.</p>`,
      },
      {
        num: '8.3', kicker: 'Foodpanda', title: 'Foodpanda orders', shot: 'foodpanda-orders', figW: 172,
        lead: 'Keeps orders that arrive through Foodpanda apart from your own, with their own status pipeline and report line.',
        html: `
<ol class="steps">
<li>Press the <span class="ui">DISABLED</span> button to enable Foodpanda mode (it then reads ENABLED). The same switch is in <span class="path">Settings → Self-Pickup</span>.</li>
<li>A fourth order type, <b>Foodpanda</b>, appears on the POS. Ring up the Foodpanda order there.</li>
<li>Follow it here through <b>New → Preparing → Ready → Picked</b> (or Cancelled), and search by the Foodpanda reference.</li>
</ol>
<div class="note status"><b>Status.</b> There is no automatic connection to Foodpanda. Orders received on the Foodpanda tablet are entered on the POS by hand; this screen then tracks them and keeps them separate in reports.</div>`,
      },
    ],
  },

  // ============================================================ 9
  {
    n: 9, title: 'Credit (udhaar)', thumb: 'credit-ledger',
    intro: 'Bills given on credit to known customers, what each one owes, and recovering the money.',
    pages: [
      {
        num: '9.1', kicker: 'Credit', title: 'Credits — bills on credit', shot: 'credit-list', figW: 166,
        lead: 'Every bill saved on credit, with what was paid and the balance.',
        html: `
<p>The top cards total the credit given, the amount recovered and what is still outstanding.</p>
<ol class="steps">
<li>Filter <span class="ui">Unpaid</span>, <span class="ui">Partial</span> or <span class="ui">Paid</span>, or search by name, phone or bill number.</li>
<li>Press <span class="ui">Receive</span> to take a payment — all of it or part. The balance updates.</li>
<li><span class="ui">History</span> shows the payments received on the bill; <span class="ui">Print</span> prints the bill with its balance.</li>
</ol>
<p>A bill is put on credit from the POS (<span class="path">More actions → Credit</span>, 4.10).</p>
<div class="note">Unpaid credit is never cleared by Day Close — it is carried forward until it is paid.</div>`,
      },
      {
        num: '9.2', kicker: 'Credit', title: 'Credit customers — the ledger', shot: 'credit-ledger', figW: 166,
        lead: 'The same credit, by customer: how many bills each one has open, what they have paid and what they owe.',
        html: `
<ul class="dots">
<li><b>Outstanding</b>, <b>Overdue</b>, <b>All</b> or <b>Paid</b> customers; sort by highest balance, most recent, most orders or name.</li>
<li>Click a customer card for their full ledger — every credit bill and payment in date order.</li>
<li><span class="ui">Excel</span> and <span class="ui">PDF</span> export the list for follow-up calls.</li>
</ul>
<p>The cards show credit given, received and the balance, and the date of the last order.</p>`,
      },
    ],
  },

  // ============================================================ 10
  {
    n: 10, title: 'Corrections and audit', thumb: 'audit-history',
    intro: 'Voids, complimentary bills and cancellations; correcting a bill after it was printed; and the permanent record of every change.',
    pages: [
      {
        num: '10.1', kicker: 'Corrections', title: 'Void, complimentary and cancelled bills', shot: 'void-bills', figW: 166,
        lead: 'Bills that were not sold: voided, given free (complimentary) or cancelled — each with the reason and who did it.',
        html: `
<p>The cards total each kind for the period. Switch between <span class="ui">Void</span>, <span class="ui">Complimentary</span> and <span class="ui">Cancelled</span>, or search by bill, customer or reason.</p>
<p>The table shows the bill, type, customer, items, amount, reason, who did it, when, and how often it was reprinted. <span class="ui">Print</span> prints the list.</p>
<ul class="dots">
<li><b>Void</b> — a bill that should not count (e.g. the customer left).</li>
<li><b>Complimentary</b> — food given free (e.g. a staff meal), with the reason and who approved it.</li>
<li><b>Cancelled</b> — an order cancelled before it was served; a cancel slip can go to the kitchen.</li>
</ul>
<div class="note">Open to administrators and managers.</div>`,
      },
      {
        num: '10.2', kicker: 'Corrections', title: 'Bill editor', shot: 'bill-editor', figW: 172,
        lead: 'Change any bill — even after its receipt or KOT was printed. Every change is written to the audit log.',
        html: `
<ol class="steps">
<li>Choose open/running bills or another status, and pick the bill on the left (search by number, phone or table).</li>
<li>Change quantities, remove lines or <span class="ui">Add Item</span>; adjust the discount or service charge.</li>
<li>Press <span class="ui">Save Changes</span>.</li>
</ol>
<p><span class="ui">Receipt</span> and <span class="ui">KOT</span> reprint the corrected bill; <span class="ui">Void Order</span> voids it with a reason.</p>
<p>The <b>Audit Timeline</b> on the right lists every change to this bill — who, what and when.</p>
<div class="note">Administrators and managers only. Discount requests from cashiers come here when discount approval is switched on (4.7).</div>`,
      },
      {
        num: '10.3', kicker: 'Audit', title: 'Bill and KOT edit history', shot: 'audit-history', figW: 172,
        lead: 'One permanent timeline of item edits, cancellations, discounts, payments, voids, approvals and reprints across all bills.',
        html: `
<ul class="dots">
<li>The counters show totals by kind: item edits, voids and rejects, approvals, blocks and prints.</li>
<li>Search by bill, item, customer, phone, user or reason; filter by action, user and dates.</li>
<li>Each row: time, bill, KOT number, action, the item and reason, the change (e.g. quantity 1 → 0) and the user with their role.</li>
<li><span class="ui">Export CSV</span> downloads the timeline for an accountant or an owner abroad.</li>
</ul>
<div class="note tip"><b>Tip.</b> A sudden run of <i>Item Cancelled</i> by one user after the KOT printed is worth a look — this screen makes it visible.</div>`,
      },
    ],
  },
];
