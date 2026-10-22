// The complete module list printed in the guide (section 1.2).
//
// The modules themselves — name, menu group, and who gets each by default — are
// read from the software (src/lib/permissions.ts), so this list cannot miss one.
// What is written here is only the one-line purpose and the guide section that
// explains each module. The page number is filled in by build-guide.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const perm = fs.readFileSync(path.join(repo, 'src/lib/permissions.ts'), 'utf8');

export const hiddenOffline = (perm.match(/OFFLINE_HIDDEN_KEYS = \[([\s\S]*?)\];/)[1].match(/'([^']+)'/g) || []).map(s => s.slice(1, -1));
export const PAGES = [...perm.matchAll(/\{ key: '([^']+)',\s*path: '([^']+)',\s*title: '([^']+)',\s*group: '([^']+)',\s*defaultRoles: \[([^\]]*)\] \}/g)]
  .map(m => ({ key: m[1], path: m[2], title: m[3], group: m[4], roles: (m[5].match(/'([^']+)'/g) || []).map(s => s.slice(1, -1)) }));
if (PAGES.length < 50) throw new Error(`permissions.ts parse found only ${PAGES.length} pages`);

// key → [what it is for, guide section]
const INFO = {
  pos: ['Sale screen: take orders, discounts, payment, receipt and kitchen slip', '4.2'],
  tables: ['Dining room: free and running tables, floor map, table QR codes', '5.1'],
  bills: ['Retrieve: every open, held and part-paid bill', '6.1'],
  delivery: ['Delivery board: rider assignment and customer messages', '8.1'],
  pickup: ['Self-pickup orders: ready message and hand-over', '8.2'],
  'rider-app': ['Riders update their deliveries on a phone', '20.1'],
  kitchen: ['Kitchen display: live tickets with timers; TV mode', '7.1'],
  credits: ['Bills given on credit (udhaar) and their recovery', '9.1'],
  'credit-customers': ['Credit by customer: ledger of bills and payments', '9.2'],
  'void-bills': ['Voided, complimentary and cancelled bills with reasons', '10.1'],
  'pending-payments': ['Part-paid bills: collect the remaining amount', '6.2'],
  'bill-reprint': ['Find and reprint any bill, read-only; reprint history', '6.3'],
  'foodpanda-orders': ['Foodpanda orders tracked apart from your own', '8.3'],
  'online-portal': ['Online ordering page for customers', '20.1'],
  'online-approval': ['Accept or reject online orders', '20.1'],
  'blocked-customers': ['Stop abusive online customers', '20.1'],
  'blocked-locations': ['Stop orders from chosen areas', '20.1'],
  whatsapp: ['Send one customer a WhatsApp message from a template', '13.6'],
  customers: ['Customer database built from your bills; loyalty points', '13.1'],
  'customer-map': ['Customers on a map', '20.1'],
  crm: ['Retention, repeat rate and top customers', '13.3'],
  marketing: ['Contacts: WhatsApp messages to many customers', '13.4'],
  'promo-codes': ['Discount codes with dates, limits and usage count', '13.5'],
  menu: ['Categories and items; sizes, weights; Excel import', '11.1'],
  variations: ['Deals and combos at one price', '11.4'],
  inventory: ['Stock of raw materials and shop items; low-stock alerts', '12.1'],
  recipes: ['Ingredients per item; food cost and margin', '12.3'],
  wastage: ['Stock thrown away, with reason and cost', '12.5'],
  receiving: ['Supplier deliveries (GRN); updates stock and cost', '12.4'],
  accounts: ['Income, expenses, payment accounts, cash close', '14.1'],
  parties: ['Suppliers and account customers with ledgers', '14.5'],
  'daily-wages': ['Day-rate workers: entries, payments, advances', '14.6'],
  hr: ['Employees, attendance, leaves, payslips, advances', '15.1'],
  users: ['Sign-in accounts, roles, page access and PIN', '15.4'],
  dashboard: ['Today and the last 7 / 30 days at a glance', '16.1'],
  profitability: ['Revenue against food cost and wastage', '16.10'],
  costing: ['Food cost per item, consumption, stock value', '16.11'],
  reports: ['Bills, totals, cashiers, category and product wise', '16.3'],
  'reports-center': ['Management reports and full PDF export', '16.6'],
  'token-module': ['Tandoor token register and reconciliation', '16.12'],
  'sales-report': ['Printable sales report and thermal shift report', '16.7'],
  staff: ['Waiters and riders lists used by the POS', '15.3'],
  'advanced-reports': ['Item and size-by-size sales from every source', '16.8'],
  'admin-sales-history': ['Permanent sales archive for the administrator', '16.9'],
  'audit-history': ['Timeline of every bill and KOT change', '10.3'],
  'bill-editor': ['Correct any bill; every change is logged', '10.2'],
  settings: ['Restaurant, charges, looks, tables, printing, displays', '18.1'],
  'printer-settings': ['Printer Center: printers, roles, margins, quality', '19.1'],
  'printer-diagnostics': ['Detect, test and troubleshoot printers', '19.12'],
  branches: ['Several branches in one account', '20.1'],
  'branches-map': ['Branches on a map', '20.1'],
  'live-map': ['Branches and devices on a live map', '20.1'],
  'live-riders': ['Live rider positions', '20.1'],
  riders: ['Rider list with live status', '20.1'],
  backup: ['Backup, restore, reset and erase data', '17.4'],
  devices: ['Approve the devices of an account', '20.1'],
  version: ['Version roll-out for the account', '20.1'],
  'day-close': ['Shift report, archive, clear the day, reset sale', '17.1'],
};
for (const p of PAGES) if (!INFO[p.key]) throw new Error(`modules.mjs: no description for "${p.key}" — add it`);

// Screens that open from inside a module rather than from the menu
export const EXTRA = [
  { name: 'Kitchen TV board', group: 'Operations', what: 'Full-screen kitchen board, opened from Kitchen → TV Mode', ref: '7.3' },
  { name: 'Customer Display', group: 'Operations', what: 'Order-status screen for a second monitor or TV', ref: '7.4' },
  { name: 'Weight panel', group: 'Operations', what: 'Side panel on the POS for items sold per kg', ref: '4.5' },
  { name: 'Payment screen', group: 'Operations', what: 'Cash, online, split and partial payment on the POS', ref: '4.8' },
];

export const GROUP_ORDER = ['Operations', 'Marketing', 'Inventory', 'Accounts', 'Staff', 'Reports', 'Admin'];

/** Rows for the guide: [{ group, items: [{ name, what, ref, offline }] }] */
export function moduleRows() {
  const byGroup = new Map(GROUP_ORDER.map(g => [g, []]));
  for (const p of PAGES) {
    const [what, ref] = INFO[p.key];
    byGroup.get(p.group).push({ name: p.title, what, ref, offline: !hiddenOffline.includes(p.key) });
  }
  for (const e of EXTRA) byGroup.get(e.group).push({ name: e.name, what: e.what, ref: e.ref, offline: true, extra: true });
  return GROUP_ORDER.map(g => ({ group: g, items: byGroup.get(g) })).filter(g => g.items.length);
}
