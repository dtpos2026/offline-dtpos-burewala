# DT POS — User Guide (Roman Urdu)

Yeh guide 3 roles ke liye hai: **Cashier**, **Manager**, **Rider**.
Login URL: software open karein → Username + Password daalein → Sign In.

---

## 1) CASHIER GUIDE

### Login
- Username + Password daal kar Sign In.
- Default cashier: `cashier / cashier123` (admin change kar sakta hai).

### Naya Order banana (POS)
1. Sidebar → **POS** kholen.
2. Upar order type chunein: **Dine-in / Takeaway / Delivery**.
3. Categories se item click karein → cart me add ho jayega.
4. Qty +/− se badlein, Note add karna ho to item pe click karein.
5. **Customer** add karein (phone se search) — delivery ke liye zaroori.
6. Discount / Tax / Service charge auto/manual apply.
7. **Send to Kitchen (KOT)** dabayein → kitchen pe print/KDS chala jayega.
8. Payment ke liye **Payment** button → Cash / Card / Online / Split chunein → **Print Bill**.

### Tables (Dine-in)
- Sidebar → **Tables** → khali table click → POS open ho jayega us table ke saath.
- Order send karne ke baad table "Running" ho jayegi.
- Table transfer / merge: table pe right-click ya menu se.

### Running Bills (Retrieve)
- Sidebar → **Retrieve** → koi bhi running order kholna ho.
- Items add/remove, KOT update, payment lena — sab yahan se.

### KOT Update (item change/cancel)
- Existing order kholen → item delete ya add karein → "Send Update" pe red **REPLACED** / **CANCELLED** KOT print hoga.
- Reason puchhe to woh likhna zaroori hai (audit me jata hai).

### Online Orders (Approval)
- Agar Manual Approval mode on hai to naye online orders **Online Orders → Approval** me aate hain.
- Order check karein → **Approve** (kitchen pe jayega) ya **Reject** (reason ke saath).
- Fake number / abuse ho to **Block Customer** ya **Block Location** button use karein.

### Pending Payments / Credits
- Jis customer ne udhaar liya us ki entry **Credits / Udhaar** me dikhegi.
- Payment receive karne ke liye **Pending Payments** → customer → **Receive Payment**.

### Print Issues
- Agar printer offline ho to upar red banner aayega — **Retry All** dabayein.
- Backup printer settings me set ho to system khud switch kar dega.

### Logout
- Top bar → profile → **Logout**. Day end pe Day Close zaroor karein (Manager).

---

## 2) MANAGER GUIDE

Manager ke paas Cashier ke sare rights + neeche wale extra modules.

### Menu / Inventory
- **Menu** → category aur items add/edit, price, image, recipe link.
- **Variations / Deals** → size, add-ons, combo deals banayein.
- **Recipes** → har item ke ingredients aur cost.
- **Inventory** → stock levels, low-stock alerts.
- **Receiving** → supplier se stock aaya to entry karein → ledger me khud chala jayega.
- **Wastage** → kharab maal ki entry (cost reports me jata hai).

### Customers / CRM
- **Customers** → master list, history, loyalty points.
- **CRM Insights** → top customers, lost customers, repeat rate.
- **Customer Map** → delivery zones visualise.
- **Marketing / WhatsApp** → bulk messages, templates.
- **Promo Codes** → discount codes banayein (% / flat / first order).

### Delivery
- **Delivery Board** → naye orders → rider assign karein.
- **Riders List** → riders add, phone, status.
- **Live Riders Map** → real-time location.
- **Pickup Orders** → customer khud aa kar uthane wale orders.

### Accounts
- **Accounts** → income/expense entries, ledger, P&L.
- **Party Master** → suppliers / vendors centralised.
- **Daily Wages** → labor / helper / kitchen daily wage workers — entries + payments + advances. Auto-expense me chala jata hai.
- **Pending Payments / Credits** → customer outstanding.

### HR
- **HR** → permanent staff: attendance, salary, advance, deductions.

### Reports
- **Dashboard** → aaj ki sales, top items, summary.
- **Reports / Reports Center** → date-wise sales, item-wise, payment-mode-wise.
- **Profitability** → margin per item / category.
- **Cost Reports** → recipe cost vs sale price.
- **Admin Sales History** → har bill ka detail.
- **Audit History** → KOT edits, voids, approvals, blocks — sab ka log (delete nahi hota).
- **Void Bills** → cancelled bills review.

### Online Orders Settings
- **Settings → Online Orders**:
  - Global mode: **Manual Approval** ya **Auto Processing**.
  - Per-source override (Website / QR / Order Taker / Delivery): auto / manual / inherit.
- **Blocked Customers** + **Blocked Locations** se abusive numbers/areas band karein.

### Day Close
- **Settings → Day Close** se din ka closing → cash count, summary print.

### Backup
- **Backup** → manual JSON export. Cloud sync auto hota hai.

---

## 3) RIDER GUIDE

Rider ke liye alag simple app shell hai.

### Login
- Manager se mila phone + 4-digit PIN.
- Open: `https://<your-site>/#/rider-app` ya admin se URL.

### Naya Order Pickup
1. **Rider App** open → "Assigned to Me" list dikhegi.
2. Order kholen → customer name, address, items, total dikhega.
3. **Map** button → Google Maps me direction.
4. Restaurant se order pickup karne par **Picked Up** dabayein.

### Delivery
1. Customer ke paas pohanchne par **Arrived** mark karein (optional, live tracking ke liye).
2. Order de kar **Delivered** dabayein.
3. Cash collect kiya ho to **Cash Received** confirm karein → us order ka payment status update ho jayega.
4. Agar customer ne return kiya ya address galat ho — **Failed** with reason.

### Live Location
- App khulne par GPS background me location bhejta hai (Live Riders Map pe manager dekh sakta hai).
- Phone ki location ON rakhein.

### Day End
- Sab orders mark complete karein → **Logout**.
- Collected cash manager ko submit karein (system me **Pending Payments** se cross-check ho jayega).

---

## Quick Tips (sab roles ke liye)
- **Internet jaye to** software offline kaam karta hai — wapis aane par auto-sync ho jata hai.
- **Print fail** ho to red banner me Retry All dabayein.
- **KOT galti** ho to Audit History me sab change record hota hai — kuch chhupta nahi.
- **Multi-branch** ho to upar branch selector se branch change karein.
- **Help**: support chat widget (bottom right) ya WhatsApp Digital Target ko.

---

*Banaya by Digital Target — DT POS Enterprise.*
