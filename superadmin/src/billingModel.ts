// ============================================================
// OFFLINE BILLING / ERP — data model (no Firebase import, so it is testable).
//
// Digital Target's own billing of offline POS customers. Kept apart from the
// POS's online (cloud tenant) billing: its own collections, its own screen.
//
//   offlineInvoices/{id}      one bill per document (staff only)
//   offlineBilling/profile    invoice branding: name, contacts, logo, signature
//   invoiceVerify/{code}      what the invoice QR shows — a random code, and
//                             only the fields a customer may see (public get)
// ============================================================

export interface InvoiceCustomer {
  restaurant: string;
  owner: string;
  address: string;
  phone: string;
  whatsapp: string;
  licenseKey: string;
  /** Free text or link: client ID, contract, portal link… */
  licenseRef: string;
}

export interface ExtraCharge { label: string; amount: number }

export interface OfflineInvoice {
  id: string;
  invoiceNo: string;
  /** YYYY-MM-DD */
  date: string;
  customer: InvoiceCustomer;
  /** Software / package, e.g. "DT POS Enterprise — Yearly" */
  pkg: string;
  description: string;
  amount: number;
  /** "Additional payment details" — installation, extra device, hardware… */
  extras: ExtraCharge[];
  discount: number;
  paid: boolean;
  /** YYYY-MM-DD, when paid */
  paymentDate: string;
  paymentMethod: string;
  notes: string;
  /** Random reference printed in the QR; never a database ID. */
  verifyCode: string;
  createdAt: number;
  updatedAt: number;
  by?: string;
}

export interface BillingProfile {
  businessName: string;
  tagline: string;
  personName: string;
  personTitle: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  website: string;
  /** data: URL; the Digital Target mark is used when empty */
  logo: string;
  /** data: URL of the uploaded signature */
  signature: string;
  invoicePrefix: string;
  currency: string;
  /** Page the QR opens; the verification code is appended. Empty = this panel's address. */
  verifyBaseUrl: string;
  footerNote: string;
}

/** Editable defaults — nothing here is fixed in the invoice layout. */
export const DEFAULT_PROFILE: BillingProfile = {
  businessName: 'Digital Target',
  tagline: 'Smart POS Solutions',
  personName: '',
  personTitle: 'Authorised signatory',
  phone: '+92 345 1873354',
  whatsapp: '+92 332 2373354',
  email: 'digitaltarget.digital@gmail.com',
  address: '',
  website: '',
  logo: '',
  signature: '',
  invoicePrefix: 'DT',
  currency: 'Rs.',
  verifyBaseUrl: '',
  footerNote: 'Thank you for choosing DT POS Enterprise.',
};

export function emptyCustomer(): InvoiceCustomer {
  return { restaurant: '', owner: '', address: '', phone: '', whatsapp: '', licenseKey: '', licenseRef: '' };
}

const pad = (n: number, w: number) => String(n).padStart(w, '0');
export const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;

/** DT-2026-0007: prefix, year, then one more than the highest number used that year. */
export function nextInvoiceNo(existing: string[], prefix: string, year = new Date().getFullYear()): string {
  const p = (prefix || 'DT').trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || 'DT';
  const head = `${p}-${year}-`;
  let max = 0;
  for (const no of existing) {
    if (!no.startsWith(head)) continue;
    const n = Number(no.slice(head.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${head}${pad(max + 1, 4)}`;
}

export function invoiceTotal(inv: Pick<OfflineInvoice, 'amount' | 'extras' | 'discount'>): number {
  const extras = (inv.extras || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  return Math.max(0, Math.round(((Number(inv.amount) || 0) + extras - (Number(inv.discount) || 0)) * 100) / 100);
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** 16 characters from a 32-letter alphabet: 80 bits, not guessable. */
export function newVerifyCode(rand: (n: number) => Uint8Array = n => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = rand(16);
  let out = '';
  for (let i = 0; i < 16; i++) out += CODE_ALPHABET[bytes[i] % 32];
  return out;
}

/** DTPOS-••••-••••-••••-K7KY — enough to recognise a key, not enough to use it. */
export function maskLicenseKey(key: string): string {
  const k = (key || '').trim().toUpperCase();
  if (!k) return '';
  const parts = k.split('-');
  if (parts.length < 3) return k.length > 4 ? '•'.repeat(k.length - 4) + k.slice(-4) : k;
  return parts.map((p, i) => (i === 0 || i === parts.length - 1 ? p : '••••')).join('-');
}

export function verifyUrl(profile: Pick<BillingProfile, 'verifyBaseUrl'>, code: string, fallbackBase: string): string {
  const base = (profile.verifyBaseUrl || fallbackBase || '').trim();
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}verify=${encodeURIComponent(code)}`;
}

/** The ONLY fields the public verification page receives. */
export interface VerifyRecord {
  invoiceNo: string;
  date: string;
  restaurant: string;
  owner: string;
  licenseMasked: string;
  licenseStatus: string;
  plan: string;
  expiry: string;
  paid: boolean;
  paymentDate: string;
  total: number;
  currency: string;
  issuer: string;
  issuerContact: string;
  updatedAt: number;
}

export function verifyRecordFor(
  inv: OfflineInvoice,
  profile: BillingProfile,
  licence: { status: string; plan: string; expiry: string },
): VerifyRecord {
  return {
    invoiceNo: inv.invoiceNo,
    date: inv.date,
    restaurant: inv.customer.restaurant,
    owner: inv.customer.owner,
    licenseMasked: maskLicenseKey(inv.customer.licenseKey),
    licenseStatus: licence.status,
    plan: licence.plan,
    expiry: licence.expiry,
    paid: inv.paid,
    paymentDate: inv.paid ? inv.paymentDate : '',
    total: invoiceTotal(inv),
    currency: profile.currency,
    issuer: profile.businessName,
    issuerContact: profile.whatsapp || profile.phone,
    updatedAt: Date.now(),
  };
}

export function money(n: number, currency = 'Rs.'): string {
  return `${currency} ${Number(n || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
}

export function matchesSearch(inv: OfflineInvoice, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const c = inv.customer;
  return [inv.invoiceNo, inv.pkg, inv.description, inv.notes, c.restaurant, c.owner, c.phone, c.whatsapp, c.address, c.licenseKey, c.licenseRef]
    .some(v => String(v || '').toLowerCase().includes(s));
}
