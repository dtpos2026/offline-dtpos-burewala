// ============================================================
// Sample data for the User Guide screenshots.
//
// A fictional "Sample Restaurant" with a real-looking menu, tables, 30 days of
// sales, open tables, deliveries, credit bills, stock, recipes, staff and
// accounts — so every screen in the guide shows how it looks in daily use.
// It is loaded into the browser's storage by capture.mjs before each screen;
// nothing here is shipped with the software.
//
// Deterministic: the same numbers every run (seeded random), dated relative to
// the day the screenshots are taken.
// ============================================================

let seed = 20261022;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const iso = (d) => new Date(d).toISOString();
const ymd = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

export function buildDemo(now = Date.now()) {
  seed = 20261022;
  const DAY = 86400000;
  const today = new Date(now); today.setHours(0, 0, 0, 0);

  // Category icons are plain letters — the guide shows no food pictures.
  const categories = [
    { id: 'burgers', name: 'Burgers', icon: 'B', sortOrder: 1 },
    { id: 'pizza', name: 'Pizza', icon: 'P', sortOrder: 2 },
    { id: 'bbq', name: 'BBQ & Grill', icon: 'G', sortOrder: 3 },
    { id: 'karahi', name: 'Karahi & Handi', icon: 'K', sortOrder: 4 },
    { id: 'rice', name: 'Rice & Biryani', icon: 'R', sortOrder: 5 },
    { id: 'sides', name: 'Sides', icon: 'S', sortOrder: 6 },
    { id: 'drinks', name: 'Drinks', icon: 'D', sortOrder: 7 },
    { id: 'desserts', name: 'Desserts', icon: 'T', sortOrder: 8 },
  ];
  const kitchens = [
    { id: 'k-main', name: 'Main Kitchen', sortOrder: 1, color: '#7c3aed' },
    { id: 'k-bbq', name: 'BBQ Counter', sortOrder: 2, color: '#dc2626' },
    { id: 'k-bev', name: 'Beverages', sortOrder: 3, color: '#0284c7' },
  ];
  const M = (id, name, categoryId, price, kitchenId = 'k-main', extra = {}) =>
    ({ id, name, categoryId, pricingType: 'fixed', price, ratePerKg: 0, isActive: true, kitchenId, ...extra });
  const pizzaSizes = (s, m, l) => ({ pricingType: 'size', sizeVariants: [{ name: 'Small', price: s }, { name: 'Medium', price: m }, { name: 'Large', price: l }] });
  const menuItems = [
    M('m-zinger', 'Zinger Burger', 'burgers', 550),
    M('m-beef', 'Beef Smash Burger', 'burgers', 890),
    M('m-chicken-burger', 'Grilled Chicken Burger', 'burgers', 690),
    M('m-double', 'Double Patty Burger', 'burgers', 1150),
    M('m-fajita', 'Chicken Fajita Pizza', 'pizza', 1250, 'k-main', pizzaSizes(750, 1250, 1750)),
    M('m-tikka-pizza', 'Chicken Tikka Pizza', 'pizza', 1250, 'k-main', pizzaSizes(750, 1250, 1750)),
    M('m-pepperoni', 'Pepperoni Feast', 'pizza', 1450, 'k-main', pizzaSizes(850, 1450, 1950)),
    M('m-veggie', 'Garden Veggie Pizza', 'pizza', 1100, 'k-main', pizzaSizes(650, 1100, 1550)),
    M('m-malai', 'Malai Boti', 'bbq', 1100, 'k-bbq'),
    M('m-seekh', 'Seekh Kabab (4 pcs)', 'bbq', 950, 'k-bbq'),
    M('m-tikka', 'Chicken Tikka', 'bbq', 650, 'k-bbq'),
    M('m-fish', 'Grilled Fish', 'bbq', 1750, 'k-bbq'),
    M('m-ck-half', 'Chicken Karahi Half', 'karahi', 1600),
    M('m-ck-full', 'Chicken Karahi Full', 'karahi', 2900),
    M('m-mutton', 'Mutton Karahi (per kg)', 'karahi', 3600, 'k-main', { pricingType: 'weight', ratePerKg: 3600 }),
    M('m-handi', 'Chicken White Handi', 'karahi', 1450),
    M('m-biryani', 'Chicken Biryani', 'rice', 450),
    M('m-pulao', 'Beef Pulao', 'rice', 520),
    M('m-egg-rice', 'Egg Fried Rice', 'rice', 480),
    M('m-fries', 'Masala Fries', 'sides', 350),
    M('m-naan', 'Garlic Naan', 'sides', 120),
    M('m-raita', 'Raita', 'sides', 90),
    M('m-salad', 'Fresh Salad', 'sides', 180),
    M('m-coke', 'Cold Drink 500ml', 'drinks', 120, 'k-bev'),
    M('m-lime', 'Fresh Lime', 'drinks', 220, 'k-bev'),
    M('m-mint', 'Mint Margarita', 'drinks', 320, 'k-bev'),
    M('m-water', 'Mineral Water 1.5L', 'drinks', 140, 'k-bev'),
    M('m-chai', 'Doodh Patti Chai', 'drinks', 150, 'k-bev'),
    M('m-kulfi', 'Kulfi Falooda', 'desserts', 380),
    M('m-lava', 'Chocolate Lava Cake', 'desserts', 450),
    M('m-brownie', 'Brownie Sundae', 'desserts', 520),
  ];
  const priceOf = (m) => m.pricingType === 'size' ? m.sizeVariants[1].price : m.price;

  const floors = [
    { id: 'f-ground', name: 'Ground Floor', sortOrder: 1 },
    { id: 'f-family', name: 'Family Hall', sortOrder: 2 },
  ];
  const tables = [];
  for (let i = 1; i <= 8; i++) tables.push({ id: `t-${i}`, name: `T-${i}`, seats: i % 3 === 0 ? 6 : 4, status: 'free', floorId: 'f-ground', shape: i % 2 ? 'square' : 'round' });
  for (let i = 1; i <= 4; i++) tables.push({ id: `fh-${i}`, name: `F-${i}`, seats: 8, status: 'free', floorId: 'f-family', shape: 'rectangle' });

  const waiters = [
    { id: 'w-1', name: 'Usman', phone: '0301-5550101', isActive: true },
    { id: 'w-2', name: 'Kashif', phone: '0302-5550102', isActive: true },
    { id: 'w-3', name: 'Imran', phone: '0303-5550103', isActive: true },
  ];
  const riders = [
    { id: 'r-1', name: 'Asif (Rider)', phone: '0311-5550201', isActive: true, pin: '0000', bikeNumber: 'BWL-4521' },
    { id: 'r-2', name: 'Naveed (Rider)', phone: '0312-5550202', isActive: true, pin: '0000', bikeNumber: 'BWL-7788' },
  ];
  const users = [
    { id: 'admin-default', name: 'Administrator', username: 'admin', password: 'admin123', role: 'admin', isActive: true, pin: '1234' },
    { id: 'u-manager', name: 'Hamza (Manager)', username: 'hamza', password: 'manager1', role: 'manager', isActive: true },
    { id: 'u-cashier', name: 'Bilal (Cashier)', username: 'bilal', password: 'cashier1', role: 'cashier', isActive: true, pin: '4321' },
  ];

  const customersSeed = [
    ['Ahmed Khan', '0300-1234567', 'House 12, Model Town, Burewala'],
    ['Sara Malik', '0321-7654321', 'Street 4, Faisal Colony, Burewala'],
    ['Usman Tariq', '0333-1112233', 'Near Main Bazar, Burewala'],
    ['Ayesha Noor', '0345-9988776', 'Block C, Satellite Town, Burewala'],
    ['Bilal Ahmed', '0302-4455667', 'College Road, Burewala'],
    ['Fatima Zahra', '0315-3344556', 'Vehari Road, Burewala'],
    ['Hassan Raza', '0308-2233445', 'Housing Colony, Burewala'],
    ['Zainab Ali', '0322-6677889', 'Gulshan-e-Iqbal, Burewala'],
  ];

  const orders = [];
  let orderNumber = 1000;
  const payAccounts = [
    { id: 'pa-jazz', name: 'JazzCash Main', accountNumber: '0345-1873354', accountTitle: 'Sample Restaurant', type: 'jazzcash', isActive: true, sortOrder: 1 },
    { id: 'pa-meezan', name: 'Meezan Bank', accountNumber: 'PK36 MEZN 0001 2345 6789 0001', accountTitle: 'Sample Restaurant', type: 'bank', isActive: true, sortOrder: 2 },
  ];
  const cashiers = [{ id: 'u-cashier', name: 'Bilal (Cashier)' }, { id: 'admin-default', name: 'Administrator' }];

  const makeLines = (n) => {
    const lines = [];
    for (let i = 0; i < n; i++) {
      const m = pick(menuItems.filter(x => x.pricingType !== 'weight'));
      const qty = between(1, 3);
      const variant = m.pricingType === 'size' ? pick(m.sizeVariants) : null;
      const price = variant ? variant.price : priceOf(m);
      const existing = lines.find(l => l.menuItemId === m.id && (l.variantName || '') === (variant?.name || ''));
      if (existing) { existing.quantity += qty; existing.lineTotal = existing.quantity * existing.price; existing.printedQty = existing.quantity; continue; }
      lines.push({
        id: `l-${orderNumber}-${i}`, menuItemId: m.id, name: m.name, pricingType: m.pricingType, price, quantity: qty,
        lineTotal: price * qty, note: '', printedQty: qty,
        ...(variant ? { variantType: 'size', variantName: variant.name } : {}),
      });
    }
    return lines;
  };
  const totals = (items, type, discountPct = 0) => {
    const subtotal = items.reduce((s, l) => s + l.lineTotal, 0);
    const discount = Math.round(subtotal * discountPct / 100);
    const scPct = type === 'dining' ? 5 : 0;
    const serviceCharge = Math.round((subtotal - discount) * scPct / 100);
    const deliveryChargeAmount = type === 'delivery' ? 100 : 0;
    const grandTotal = subtotal - discount + serviceCharge + deliveryChargeAmount;
    return { subtotal, discount, serviceCharge, serviceChargePercent: scPct, serviceChargeType: 'percent', tax: 0, deliveryChargeAmount, grandTotal, ...(discountPct ? { discountPercent: discountPct, discountType: 'percent', discountValue: discountPct } : {}) };
  };

  // ----- 30 days of paid sales (busier at weekends) -----
  for (let d = 29; d >= 0; d--) {
    const dayStart = today.getTime() - d * DAY;
    const dow = new Date(dayStart).getDay();
    const count = d === 0 ? 18 : between(14, 24) + (dow === 5 || dow === 6 || dow === 0 ? 8 : 0);
    for (let k = 0; k < count; k++) {
      orderNumber++;
      const hour = pick([12, 13, 13, 14, 15, 17, 19, 19, 20, 20, 21, 21, 22, 23]);
      let created = dayStart + hour * 3600000 + between(0, 59) * 60000;
      // today's bills fall inside today's business day (it opens at 08:00)
      if (d === 0) created = Math.max(dayStart + 8 * 3600000 + 5 * 60000, now - between(15, 200) * 60000);
      const type = pick(['dining', 'dining', 'takeaway', 'takeaway', 'delivery']);
      const items = makeLines(between(1, 4));
      const disc = rnd() < 0.12 ? pick([5, 10]) : 0;
      const t = totals(items, type, disc);
      const method = rnd() < 0.68 ? 'cash' : (rnd() < 0.8 ? 'online' : 'card');
      const cashier = pick(cashiers);
      const cust = type !== 'dining' && rnd() < 0.7 ? pick(customersSeed) : null;
      const table = type === 'dining' ? pick(tables) : null;
      const waiter = type === 'dining' ? pick(waiters) : null;
      const rider = type === 'delivery' ? pick(riders) : null;
      const paidAt = Math.min(created + between(15, 55) * 60000, now - 2 * 60000);
      const acct = method === 'online' ? pick(payAccounts) : null;
      orders.push({
        id: `o-${orderNumber}`, orderNumber, orderType: type, status: 'paid', source: 'pos',
        items, ...t, paymentMethod: method, amountPaid: t.grandTotal,
        ...(acct ? { paymentAccountId: acct.id, paymentAccountName: acct.name } : {}),
        ...(method === 'cash' ? { cashReceived: Math.ceil(t.grandTotal / 500) * 500, changeReturned: Math.ceil(t.grandTotal / 500) * 500 - t.grandTotal } : {}),
        payments: [{ id: `p-${orderNumber}`, method: method === 'card' ? 'card' : method, amount: t.grandTotal, at: iso(paidAt), by: cashier.name, ...(acct ? { accountId: acct.id, accountName: acct.name } : {}) }],
        cashierId: cashier.id, cashierName: cashier.name,
        ...(table ? { tableId: table.id, tableName: table.name } : {}),
        ...(waiter ? { waiterId: waiter.id, waiterName: waiter.name } : {}),
        ...(rider ? { riderId: rider.id, riderName: rider.name, riderPhone: rider.phone, deliveryStatus: 'delivered', dispatchedAt: iso(created + 20 * 60000), deliveredAt: iso(paidAt) } : {}),
        ...(cust ? { customer: { id: cust[1], name: cust[0], phone: cust[1], address: cust[2] } } : {}),
        kitchenStatus: type === 'delivery' ? 'delivered' : 'served', kotPrinted: true, kotPrintCount: 1, receiptPrinted: true,
        createdAt: iso(created), paidAt: iso(paidAt), notes: '',
      });
    }
  }

  // ----- Open work right now: running tables, hold, deliveries, pickup -----
  const live = (type, minutesAgo, extra = {}, n = 3) => {
    orderNumber++;
    const items = makeLines(n);
    const t = totals(items, type);
    const o = { id: `o-${orderNumber}`, orderNumber, orderType: type, status: 'running', source: 'pos', items, ...t,
      cashierId: 'u-cashier', cashierName: 'Bilal (Cashier)', createdAt: iso(now - minutesAgo * 60000), notes: '',
      kotPrinted: true, kotPrintCount: 1, kotFirstPrintedAt: iso(now - minutesAgo * 60000 + 30000), kitchenStatus: 'preparing',
      cookingStartedAt: iso(now - minutesAgo * 60000 + 30000), ...extra };
    orders.push(o);
    return o;
  };
  const seat = (tableId, minutesAgo, guests, waiter, n) => {
    const tb = tables.find(t => t.id === tableId);
    const o = live('dining', minutesAgo, { tableId: tb.id, tableName: tb.name, waiterId: waiter.id, waiterName: waiter.name }, n);
    Object.assign(tb, { status: 'running', currentOrderId: o.id, seatedAt: o.createdAt, seatedGuests: guests });
  };
  seat('t-2', 34, 4, waiters[0], 4);
  seat('t-5', 12, 2, waiters[1], 2);
  seat('t-7', 58, 6, waiters[2], 5);
  seat('fh-1', 21, 8, waiters[0], 4);
  live('takeaway', 6, { status: 'hold', kitchenStatus: undefined, kotPrinted: false, customer: { id: '0321-7654321', name: 'Sara Malik', phone: '0321-7654321', address: '' }, notes: 'Customer will collect after 7 pm' }, 2);
  live('delivery', 18, { deliveryStatus: 'cooking', customer: { id: '0300-1234567', name: 'Ahmed Khan', phone: '0300-1234567', address: 'House 12, Model Town, Burewala' } }, 3);
  live('delivery', 41, { deliveryStatus: 'onway', riderId: 'r-1', riderName: 'Asif (Rider)', riderPhone: '0311-5550201', dispatchedAt: iso(now - 9 * 60000), kitchenStatus: 'ready', readyAt: iso(now - 12 * 60000), customer: { id: '0345-9988776', name: 'Ayesha Noor', phone: '0345-9988776', address: 'Block C, Satellite Town, Burewala' } }, 4);
  live('takeaway', 9, { pickupRequested: true, pickupTime: '20 min', customer: { id: '0333-1112233', name: 'Usman Tariq', phone: '0333-1112233', address: '' } }, 2);

  // ----- An edit trail on a few bills (Bill / KOT Edit History) -----
  const by = { userName: 'Bilal (Cashier)', userRole: 'cashier', deviceName: 'Counter PC' };
  const t7 = orders.find(o => o.tableId === 't-7' && o.status === 'running');
  if (t7) {
    const a = t7.items[0], b = t7.items[1];
    const at = (m) => iso(now - m * 60000);
    t7.editLogs = [
      { at: at(58), action: 'CREATE', newValue: t7.items.length + ' items', ...by },
      { at: at(40), action: 'QTY_UP', itemId: a.id, itemName: a.name, oldValue: a.quantity - 1, newValue: a.quantity, ...by },
      { at: at(31), action: 'CANCEL', itemId: b.id, itemName: 'Raita', oldValue: 1, newValue: 0, reason: 'Customer changed mind', ...by },
    ];
    t7.kotRevisions = [
      { kotNo: 1, type: 'NEW', lines: t7.items.map(l => ({ itemId: l.id, name: l.name, deltaQty: l.quantity })), createdAt: at(58), createdByName: by.userName },
      { kotNo: 2, type: 'MIXED', lines: [{ itemId: a.id, name: a.name, deltaQty: 1, oldQty: a.quantity - 1, newQty: a.quantity }, { itemId: 'x', name: 'Raita', deltaQty: -1, oldQty: 1, newQty: 0, reason: 'Customer changed mind' }], createdAt: at(31), createdByName: by.userName },
    ];
  }
  const paidToday = orders.filter(o => o.status === 'paid' && new Date(o.createdAt).getTime() >= today.getTime()).slice(0, 3);
  paidToday.forEach((o, i) => {
    o.editLogs = [
      { at: o.createdAt, action: 'CREATE', newValue: o.items.length + ' items', ...by },
      ...(i === 0 ? [{ at: o.paidAt, action: 'DISCOUNT', oldValue: 0, newValue: '10%', reason: 'Regular customer', userName: 'Hamza (Manager)', userRole: 'manager', deviceName: 'Counter PC' }] : []),
      { at: o.paidAt, action: 'PAYMENT', newValue: o.grandTotal, ...by },
    ];
  });

  // ----- Credit (udhaar), partial, void and complimentary bills -----
  const closed = (status, daysAgo, extra = {}, n = 3) => {
    orderNumber++;
    const items = makeLines(n);
    const type = status === 'partial' ? 'takeaway' : 'dining';
    const t = totals(items, type);
    const created = daysAgo === 0 ? now - 95 * 60000 : today.getTime() - daysAgo * DAY + 15 * 3600000;
    const tb = type === 'dining' ? pick(tables.filter(x => x.status === 'free')) : null;
    orders.push({ id: `o-${orderNumber}`, orderNumber, orderType: type, status, source: 'pos', items, ...t,
      ...(tb ? { tableId: tb.id, tableName: tb.name, waiterId: 'w-2', waiterName: 'Kashif' } : {}),
      cashierId: 'u-cashier', cashierName: 'Bilal (Cashier)', createdAt: iso(created), notes: '', kotPrinted: true, kotPrintCount: 1,
      kitchenStatus: 'served', pickupCollectedAt: iso(created + 25 * 60000), ...extra(t, created) });
  };
  closed('credit_pending', 3, (t) => ({ paymentMethod: 'credit', amountPaid: 0, creditCustomerName: 'Hassan Raza', creditCustomerPhone: '0308-2233445', customer: { id: '0308-2233445', name: 'Hassan Raza', phone: '0308-2233445', address: 'Housing Colony, Burewala' } }), 4);
  closed('credit_pending', 1, (t) => ({ paymentMethod: 'credit', amountPaid: 0, creditCustomerName: 'Zainab Ali', creditCustomerPhone: '0322-6677889', customer: { id: '0322-6677889', name: 'Zainab Ali', phone: '0322-6677889', address: 'Gulshan-e-Iqbal, Burewala' } }), 3);
  closed('partial', 0, (t, c) => ({ paymentMethod: 'cash', amountPaid: 1000, payments: [{ id: `p-part-${orderNumber}`, method: 'cash', amount: 1000, at: iso(c + 20 * 60000), by: 'Bilal (Cashier)' }], customer: { id: '0302-4455667', name: 'Bilal Ahmed', phone: '0302-4455667', address: 'College Road, Burewala' } }), 3);
  closed('void', 2, () => ({ voidReason: 'Customer left before food was served', voidBy: 'Administrator', voidedAt: iso(today.getTime() - 2 * DAY + 16 * 3600000) }), 2);
  closed('complimentary', 4, () => ({ complimentaryReason: 'Staff meal approved by manager', complimentaryBy: 'Hamza (Manager)', complimentaryAt: iso(today.getTime() - 4 * DAY + 15.5 * 3600000) }), 2);

  // ----- Customers (from the sales above) -----
  const customers = customersSeed.map(([name, phone, address], i) => {
    const theirs = orders.filter(o => o.customer && o.customer.phone === phone && o.status === 'paid');
    return {
      id: '92' + phone.replace(/\D/g, '').slice(1), name, phone, addresses: [address], fullAddress: address, city: 'Burewala',
      totalOrders: theirs.length, totalSpent: theirs.reduce((s, o) => s + o.grandTotal, 0),
      firstOrderAt: theirs[0]?.createdAt, lastOrderAt: theirs[theirs.length - 1]?.createdAt,
      createdAt: iso(today.getTime() - 40 * DAY), tags: i % 3 === 0 ? ['VIP'] : [], loyaltyPoints: between(20, 300),
    };
  });

  // ----- Stock, recipes, receiving, wastage -----
  const inv = (id, name, sku, baseUnit, qty, cost, low, conversions) => ({
    id, name, sku, categoryId: 'raw', costPrice: cost, avgCostPrice: cost, salePrice: 0, quantity: qty, unit: baseUnit, baseUnit,
    lowStockThreshold: low, isActive: true, ...(conversions ? { conversions } : {}),
  });
  const inventory = [
    inv('i-chicken', 'Chicken (boneless)', 'RM-001', 'kg', 42, 780, 15),
    inv('i-mutton', 'Mutton', 'RM-002', 'kg', 9, 2400, 10),
    inv('i-beef', 'Beef Mince', 'RM-003', 'kg', 18, 1300, 8),
    inv('i-flour', 'Flour (Atta)', 'RM-004', 'kg', 64, 140, 20, [{ unit: 'Bag (20 kg)', factor: 20 }]),
    inv('i-rice', 'Basmati Rice', 'RM-005', 'kg', 55, 390, 20, [{ unit: 'Bag (25 kg)', factor: 25 }]),
    inv('i-oil', 'Cooking Oil', 'RM-006', 'l', 6, 560, 10, [{ unit: 'Tin (16 l)', factor: 16 }]),
    inv('i-cheese', 'Mozzarella Cheese', 'RM-007', 'kg', 12, 1650, 5),
    inv('i-bun', 'Burger Buns', 'RM-008', 'pcs', 140, 35, 50),
    inv('i-coke', 'Cold Drink 500ml (bottle)', 'BV-001', 'pcs', 96, 85, 48, [{ unit: 'Crate (24)', factor: 24 }]),
    inv('i-potato', 'Potatoes', 'RM-009', 'kg', 30, 90, 10),
    inv('i-yogurt', 'Yogurt', 'RM-010', 'kg', 3, 220, 5),
    inv('i-tomato', 'Tomatoes', 'RM-011', 'kg', 14, 160, 6),
  ];
  const stockLogs = [];
  inventory.forEach((it, i) => {
    stockLogs.push({ id: `sl-in-${i}`, inventoryItemId: it.id, type: 'in', quantity: Math.round(it.quantity * 1.6), note: 'Opening stock', date: iso(today.getTime() - 20 * DAY) });
    stockLogs.push({ id: `sl-sale-${i}`, inventoryItemId: it.id, type: 'sale', quantity: -Math.round(it.quantity * 0.6), note: 'Sales (recipes)', date: iso(today.getTime() - 1 * DAY) });
  });
  const recipes = [
    { id: 'rc-zinger', menuItemId: 'm-zinger', components: [{ inventoryItemId: 'i-chicken', quantity: 150, unit: 'g' }, { inventoryItemId: 'i-bun', quantity: 1, unit: 'pcs' }, { inventoryItemId: 'i-oil', quantity: 40, unit: 'ml' }] },
    { id: 'rc-beef', menuItemId: 'm-beef', components: [{ inventoryItemId: 'i-beef', quantity: 180, unit: 'g' }, { inventoryItemId: 'i-bun', quantity: 1, unit: 'pcs' }, { inventoryItemId: 'i-cheese', quantity: 30, unit: 'g' }] },
    { id: 'rc-biryani', menuItemId: 'm-biryani', components: [{ inventoryItemId: 'i-rice', quantity: 150, unit: 'g' }, { inventoryItemId: 'i-chicken', quantity: 120, unit: 'g' }, { inventoryItemId: 'i-yogurt', quantity: 30, unit: 'g' }] },
    { id: 'rc-ck-half', menuItemId: 'm-ck-half', components: [{ inventoryItemId: 'i-chicken', quantity: 500, unit: 'g' }, { inventoryItemId: 'i-tomato', quantity: 250, unit: 'g' }, { inventoryItemId: 'i-oil', quantity: 80, unit: 'ml' }] },
    { id: 'rc-fries', menuItemId: 'm-fries', components: [{ inventoryItemId: 'i-potato', quantity: 250, unit: 'g' }, { inventoryItemId: 'i-oil', quantity: 50, unit: 'ml' }] },
    { id: 'rc-coke', menuItemId: 'm-coke', components: [{ inventoryItemId: 'i-coke', quantity: 1, unit: 'pcs' }] },
  ];
  const receivingEntries = [
    { id: 'rv-1', supplierName: 'Al-Madina Poultry', inventoryItemId: 'i-chicken', itemName: 'Chicken (boneless)', quantity: 25, unit: 'kg', baseQty: 25, baseUnit: 'kg', rate: 780, receivedBy: 'Hamza (Manager)', notes: 'Morning delivery', date: iso(today.getTime() - 1 * DAY + 9 * 3600000) },
    { id: 'rv-2', supplierName: 'Punjab Rice Traders', inventoryItemId: 'i-rice', itemName: 'Basmati Rice', quantity: 2, unit: 'Bag (25 kg)', baseQty: 50, baseUnit: 'kg', rate: 9750, receivedBy: 'Hamza (Manager)', notes: '', date: iso(today.getTime() - 3 * DAY + 10 * 3600000) },
    { id: 'rv-3', supplierName: 'City Beverages', inventoryItemId: 'i-coke', itemName: 'Cold Drink 500ml (bottle)', quantity: 4, unit: 'Crate (24)', baseQty: 96, baseUnit: 'pcs', rate: 2040, receivedBy: 'Bilal (Cashier)', notes: 'Invoice #CB-2291', date: iso(today.getTime() - 2 * DAY + 11 * 3600000) },
  ];
  const wastages = [
    { id: 'ws-1', date: iso(today.getTime() - 1 * DAY + 22 * 3600000), inventoryItemId: 'i-yogurt', inventoryItemName: 'Yogurt', quantity: 1.5, unit: 'kg', costValue: 330, reason: 'expired', note: 'Past date', recordedBy: 'Hamza (Manager)' },
    { id: 'ws-2', date: iso(today.getTime() - 3 * DAY + 20 * 3600000), inventoryItemId: 'i-bun', inventoryItemName: 'Burger Buns', quantity: 12, unit: 'pcs', costValue: 420, reason: 'damaged', note: 'Crushed in delivery', recordedBy: 'Bilal (Cashier)' },
  ];

  // ----- Staff, HR, accounts -----
  const employees = [
    { id: 'e-1', empCode: 'EMP-001', name: 'Usman Ali', phone: '0301-5550101', designation: 'Head Waiter', department: 'Service', joiningDate: '2025-03-01', basicSalary: 38000, allowances: 4000, status: 'active' },
    { id: 'e-2', empCode: 'EMP-002', name: 'Rashid Mehmood', phone: '0304-5550104', designation: 'Head Chef', department: 'Kitchen', joiningDate: '2024-11-15', basicSalary: 65000, allowances: 6000, status: 'active' },
    { id: 'e-3', empCode: 'EMP-003', name: 'Bilal Ahmed', phone: '0302-5550105', designation: 'Cashier', department: 'Counter', joiningDate: '2025-06-10', basicSalary: 42000, allowances: 3000, status: 'active' },
    { id: 'e-4', empCode: 'EMP-004', name: 'Kashif Iqbal', phone: '0302-5550102', designation: 'Waiter', department: 'Service', joiningDate: '2025-08-01', basicSalary: 32000, allowances: 2000, status: 'active' },
  ];
  const attendance = [];
  for (let d = 6; d >= 0; d--) {
    const date = new Date(today.getTime() - d * DAY).toISOString().slice(0, 10);
    employees.forEach((e, i) => attendance.push({ id: `at-${e.id}-${d}`, employeeId: e.id, date, status: (d === 2 && i === 3) ? 'absent' : (d === 4 && i === 1 ? 'leave' : 'present'), inTime: '10:00', outTime: '22:00' }));
  }
  const accountCategories = [
    { id: 'ac-sales', name: 'Sales', type: 'income' },
    { id: 'ac-other-inc', name: 'Other Income', type: 'income' },
    { id: 'ac-rent', name: 'Rent', type: 'expense' },
    { id: 'ac-utilities', name: 'Electricity & Gas', type: 'expense' },
    { id: 'ac-salary', name: 'Salaries', type: 'expense' },
    { id: 'ac-grocery', name: 'Grocery & Vegetables', type: 'expense' },
    { id: 'ac-maint', name: 'Repair & Maintenance', type: 'expense' },
  ];
  const transactions = [
    { id: 'tx-1', date: ymd(today.getTime() - 5 * DAY), type: 'expense', categoryId: 'ac-rent', categoryName: 'Rent', amount: 85000, paymentMethod: 'online', description: 'Monthly shop rent', createdBy: 'Administrator' },
    { id: 'tx-2', date: ymd(today.getTime() - 3 * DAY), type: 'expense', categoryId: 'ac-utilities', categoryName: 'Electricity & Gas', amount: 38500, paymentMethod: 'cash', description: 'Electricity bill', createdBy: 'Administrator' },
    { id: 'tx-3', date: ymd(today.getTime() - 1 * DAY), type: 'expense', categoryId: 'ac-grocery', categoryName: 'Grocery & Vegetables', amount: 6200, paymentMethod: 'cash', description: 'Vegetables and spices', createdBy: 'Hamza (Manager)' },
    { id: 'tx-4', date: ymd(today.getTime() - 2 * DAY), type: 'income', categoryId: 'ac-other-inc', categoryName: 'Other Income', amount: 5000, paymentMethod: 'cash', description: 'Hall booking advance', createdBy: 'Administrator' },
    { id: 'tx-5', date: ymd(today.getTime()), type: 'expense', categoryId: 'ac-maint', categoryName: 'Repair & Maintenance', amount: 2500, paymentMethod: 'cash', description: 'Fridge gas refill', createdBy: 'Hamza (Manager)' },
  ];
  const parties = [
    { id: 'pt-1', type: 'supplier', name: 'Al-Madina Poultry', phone: '0300-7001001', address: 'Grain Market, Burewala', openingBalance: -15000, isActive: true },
    { id: 'pt-2', type: 'supplier', name: 'Punjab Rice Traders', phone: '0300-7001002', address: 'Vehari Road, Burewala', openingBalance: 0, isActive: true },
    { id: 'pt-3', type: 'customer', name: 'Green Valley School (catering)', phone: '0300-7001003', address: 'Canal Road, Burewala', openingBalance: 12000, isActive: true },
  ];
  const ledger = [
    { id: 'lg-1', partyId: 'pt-1', date: ymd(today.getTime() - 1 * DAY), description: 'Chicken 25 kg @ 780', debit: 0, credit: 19500, reference: 'GRN rv-1' },
    { id: 'lg-2', partyId: 'pt-1', date: ymd(today.getTime()), description: 'Payment (cash)', debit: 15000, credit: 0 },
    { id: 'lg-3', partyId: 'pt-3', date: ymd(today.getTime() - 2 * DAY), description: 'Catering order — 60 lunch boxes', debit: 27000, credit: 0, reference: 'INV-118' },
  ];

  const promoCodes = [
    { id: 'pc-1', code: 'WELCOME10', discountType: 'percent', discountValue: 10, usageCount: 14, usageLimit: 100, minOrderAmount: 1000, isActive: true, createdAt: iso(today.getTime() - 20 * DAY), notes: 'New customers' },
    { id: 'pc-2', code: 'FRIDAY200', discountType: 'pkr', discountValue: 200, usageCount: 6, minOrderAmount: 2000, isActive: true, createdAt: iso(today.getTime() - 10 * DAY) },
  ];
  const deals = [
    { id: 'd-1', name: 'Family Deal (4 persons)', items: [{ menuItemId: 'm-fajita', quantity: 1, variantName: 'Large', variantType: 'size' }, { menuItemId: 'm-zinger', quantity: 2 }, { menuItemId: 'm-fries', quantity: 1 }, { menuItemId: 'm-coke', quantity: 4 }], price: 3999, isActive: true, createdAt: iso(today.getTime() - 15 * DAY) },
    { id: 'd-2', name: 'BBQ Platter for 2', items: [{ menuItemId: 'm-malai', quantity: 1 }, { menuItemId: 'm-seekh', quantity: 1 }, { menuItemId: 'm-naan', quantity: 4 }, { menuItemId: 'm-raita', quantity: 1 }], price: 2350, isActive: true, createdAt: iso(today.getTime() - 15 * DAY) },
  ];
  const marketingContacts = customersSeed.map(([name, phone], i) => ({ id: `mc-${i}`, no: phone, name, category: i % 2 ? 'Regular' : 'VIP' }));

  const settings = {
    name: 'Sample Restaurant',
    address: 'Main Vehari Road, Burewala',
    phone1: '0300-1234000',
    phone2: '',
    countryCode: 'PK', currencyCode: 'PKR', currencySymbol: 'Rs',
    receiptFooter: 'Thank you for dining with us!\nVisit again soon!',
    marketingFooter: 'DIGITAL TARGET SOFTWARE SOLUTIONS\n📞 0345-1873354',
    taxAmount: 0, taxPercent: 0, taxLabel: 'GST',
    serviceChargePercent: 5, serviceChargeMode: 'percent', serviceChargeOrderTypes: { dining: true, takeaway: false, delivery: false }, serviceChargeEditable: true,
    deliveryCharge: 100,
    categoryLayout: 'right',
    paperSize: '80mm', receiptSizePreset: 'standard-80', receiptMode: 'continuous', printerDriverType: 'escpos',
    autoCut: true, cutMode: 'full', silentPrint: true,
    kotEnabled: true, autoPrintKot: true, autoKitchenPrint: true, kotFallbackToReceipt: true,
    kitchenPreparingMinutes: 5, kitchenWarningMinutes: 10,
    kitchens,
    costTrackingEnabled: true,
    loyaltyEnabled: true, loyaltyEarnPerRs100: 1, loyaltyRedeemRate: 1, loyaltyMinRedeemPoints: 100,
    discountPresets: [5, 10, 15], discountAmountPresets: [100, 200],
    whatsappTemplates: [
      { id: 'paid-default', name: 'Paid / Bill Clear', body: 'Dear {customer_name},\nYour bill/order #{order_number} has been successfully paid.\n\nTotal Amount: Rs. {grand_total}\nThank you for visiting {restaurant_name}.' },
      { id: 'delivery-default', name: 'Delivery Status', body: 'Dear {customer_name},\nYour order #{order_number} {delivery_status_line}\n\n{rider_block}\nRestaurant: {restaurant_name}\nThank you!' },
    ],
    defaultPaidWhatsAppTemplateId: 'paid-default', defaultDeliveryWhatsAppTemplateId: 'delivery-default',
  };

  return {
    __extraStorage: wageStorage(today, DAY),
    categories, menuItems, orders, tables, floors, kitchens, waiters, riders, users, settings, orderCounter: orderNumber,
    inventory, stockLogs, employees, attendance, leaves: [], payslips: [], advances: [],
    accountCategories, transactions, parties, ledger, dailyCashCloses: [], tokenRecords: [],
    receivingEntries, marketingContacts, recipes, wastages, customers, branches: [], creditPayments: [],
    promoCodes, paymentAccounts: payAccounts, deals,
  };
}

// Daily Wages keeps its own lists (lib/dailyWages.ts), outside the main data.
function wageStorage(today, DAY) {
  const d = (n) => new Date(today.getTime() - n * DAY).toISOString().slice(0, 10);
  const at = (n) => new Date(today.getTime() - n * DAY + 18 * 3600000).toISOString();
  const workers = [
    { id: 'wk-1', name: 'Shahid', mobile: '0306-5550301', category: 'kitchen_helper', designation: 'Dish washer', defaultDailyWage: 1500, active: true, createdAt: at(20) },
    { id: 'wk-2', name: 'Akram', mobile: '0307-5550302', category: 'cleaner', designation: 'Cleaner', defaultDailyWage: 1200, active: true, createdAt: at(20) },
    { id: 'wk-3', name: 'Rafiq', mobile: '0308-5550303', category: 'loader', designation: 'Loader', defaultDailyWage: 1400, active: true, createdAt: at(15) },
  ];
  const entries = [];
  for (let n = 5; n >= 0; n--) workers.forEach((w, i) => {
    if (n === 3 && i === 2) return;
    const ot = i === 0 && n === 1 ? 300 : 0;
    entries.push({ id: `we-${w.id}-${n}`, date: d(n), workerId: w.id, workerName: w.name, category: w.category, workDescription: w.designation, dailyRate: w.defaultDailyWage, days: 1, overtime: ot, bonus: 0, deduction: 0, netAmount: w.defaultDailyWage + ot, createdAt: at(n), createdBy: 'Hamza (Manager)' });
  });
  const payments = [
    { id: 'wp-1', workerId: 'wk-1', workerName: 'Shahid', amount: 6000, method: 'cash', date: d(2), note: 'Weekly payment', createdAt: at(2), createdBy: 'Hamza (Manager)' },
    { id: 'wp-2', workerId: 'wk-2', workerName: 'Akram', amount: 3600, method: 'cash', date: d(2), note: '', createdAt: at(2), createdBy: 'Hamza (Manager)' },
    { id: 'wp-3', workerId: 'wk-3', workerName: 'Rafiq', amount: 2000, method: 'cash', date: d(1), isAdvance: true, note: 'Advance', createdAt: at(1), createdBy: 'Administrator' },
  ];
  const audit = [
    { id: 'wa-1', at: at(20), action: 'worker_added', byName: 'Administrator', subjectId: 'wk-1', subjectName: 'Shahid' },
    { id: 'wa-2', at: at(2), action: 'payment_added', byName: 'Hamza (Manager)', subjectId: 'wk-1', subjectName: 'Shahid', newValue: 6000 },
    { id: 'wa-3', at: at(1), action: 'advance_added', byName: 'Administrator', subjectId: 'wk-3', subjectName: 'Rafiq', newValue: 2000 },
  ];
  return { 'dt-wage-workers': workers, 'dt-wage-entries': entries, 'dt-wage-payments': payments, 'dt-wage-audit': audit };
}
