// ============================================================
// SUPER ADMIN — Offline Billing / ERP (Premium Phase 1, sections 14–19).
// ============================================================
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PROFILE, emptyCustomer, invoiceTotal, maskLicenseKey, matchesSearch, newVerifyCode, nextInvoiceNo,
  verifyRecordFor, verifyUrl, type OfflineInvoice,
} from '../../superadmin/src/billingModel';
import { layoutInvoice } from '../../superadmin/src/invoiceRender';

function inv(over: Partial<OfflineInvoice> = {}): OfflineInvoice {
  return {
    id: 'i1', invoiceNo: 'DT-2026-0001', date: '2026-09-23',
    customer: { ...emptyCustomer(), restaurant: 'Burewala Grill', owner: 'Ali', phone: '0300', whatsapp: '0301', address: 'Main Road', licenseKey: 'DTPOS-GA2F-LFAL-7SET-K7KY', licenseRef: 'Client 104' },
    pkg: 'DT POS Enterprise', description: 'Yearly', amount: 45000, extras: [{ label: 'Installation', amount: 5000 }], discount: 2000,
    paid: false, paymentDate: '', paymentMethod: '', notes: '', verifyCode: 'K7M2Q9XW4RTB8HNC', createdAt: 1, updatedAt: 1,
    ...over,
  };
}

describe('billing data', () => {
  it('totals: amount + additional lines − discount', () => {
    expect(invoiceTotal(inv())).toBe(48000);
    expect(invoiceTotal(inv({ discount: 99999 }))).toBe(0);
  });
  it('invoice numbers continue per prefix and year', () => {
    expect(nextInvoiceNo([], 'DT', 2026)).toBe('DT-2026-0001');
    expect(nextInvoiceNo(['DT-2026-0001', 'DT-2026-0009', 'DT-2025-0044', 'XX-2026-0100'], 'dt', 2026)).toBe('DT-2026-0010');
  });
  it('search covers customer, licence and invoice fields', () => {
    for (const q of ['burewala', '0301', 'K7KY', 'DT-2026', 'client 104']) expect(matchesSearch(inv(), q)).toBe(true);
    expect(matchesSearch(inv(), 'lahore')).toBe(false);
  });
});

describe('QR verification never exposes internal data', () => {
  it('the code is random, 16 characters, unambiguous letters', () => {
    const a = newVerifyCode(), b = newVerifyCode();
    expect(a).toMatch(/^[A-HJ-NP-Z2-9]{16}$/);
    expect(a).not.toBe(b);
  });
  it('the QR link carries only the code', () => {
    const url = verifyUrl({ verifyBaseUrl: '' }, 'K7M2Q9XW4RTB8HNC', 'https://dtpos-offline.web.app/');
    expect(url).toBe('https://dtpos-offline.web.app/?verify=K7M2Q9XW4RTB8HNC');
    expect(url).not.toMatch(/DTPOS|i1|Burewala/);
  });
  it('the public record masks the licence key and holds no IDs', () => {
    const rec = verifyRecordFor(inv({ paid: true, paymentDate: '2026-09-23' }), DEFAULT_PROFILE, { status: 'active', plan: 'Yearly', expiry: '2027-09-23' });
    expect(rec.licenseMasked).toBe('DTPOS-••••-••••-••••-K7KY');
    const json = JSON.stringify(rec);
    expect(json).not.toMatch(/GA2F|LFAL|7SET/);
    expect(json).not.toMatch(/"id"|verifyCode|createdAt|"by"/);
    expect(rec).toMatchObject({ restaurant: 'Burewala Grill', owner: 'Ali', licenseStatus: 'active', paid: true, total: 48000 });
  });
  it('masking handles odd keys', () => {
    expect(maskLicenseKey('')).toBe('');
    expect(maskLicenseKey('ABCDEFGH')).toBe('••••EFGH');
  });
});

describe('invoice layouts', () => {
  const text = (l: ReturnType<typeof layoutInvoice>) => l.ops.filter(o => o.t === 'text').map(o => (o as { text: string }).text).join('\n');
  it('A4: branding, customer, licence, payment, QR and signature are all drawn', () => {
    const l = layoutInvoice(inv({ paid: true, paymentDate: '2026-09-23' }), { ...DEFAULT_PROFILE, personName: 'Signatory' }, 'a4', undefined, true);
    expect([l.width, l.height]).toEqual([794, 1123]);
    const t = text(l);
    for (const s of ['Digital Target', 'INVOICE', 'DT-2026-0001', 'Burewala Grill', 'DTPOS-GA2F-LFAL-7SET-K7KY', 'PAID', 'Payment date: 2026-09-23', 'Signatory', 'Scan to verify', '+92 332 2373354']) {
      expect(t).toContain(s);
    }
    const images = l.ops.filter(o => o.t === 'image').map(o => (o as { key: string }).key);
    expect(images).toEqual(expect.arrayContaining(['logo', 'qr', 'signature']));
  });
  it('the default (white) mark gets its brand tile; an uploaded logo does not', () => {
    const withTile = layoutInvoice(inv(), DEFAULT_PROFILE, 'a4');
    const custom = layoutInvoice(inv(), { ...DEFAULT_PROFILE, logo: 'data:image/png;base64,AAAA' }, 'a4');
    const tile = (l: ReturnType<typeof layoutInvoice>) => l.ops.some(o => o.t === 'rect' && o.w === 64 && o.h === 64);
    expect(tile(withTile)).toBe(true);
    expect(tile(custom)).toBe(false);
  });
  it('80 mm: the thermal width, and it grows with content', () => {
    const short = layoutInvoice(inv(), DEFAULT_PROFILE, '80mm');
    const long = layoutInvoice(inv({ notes: 'x '.repeat(400) }), DEFAULT_PROFILE, '80mm');
    expect(short.width).toBe(302);
    expect(long.height).toBeGreaterThan(short.height);
    expect(text(short)).toContain('UNPAID');
    for (const o of long.ops) if (o.t === 'text' && o.align !== 'center' && o.align !== 'right') expect(o.x).toBeLessThan(302);
  });
  it('no signature uploaded → no signature image', () => {
    const l = layoutInvoice(inv(), DEFAULT_PROFILE, 'a4', undefined, false);
    expect(l.ops.some(o => o.t === 'image' && o.key === 'signature')).toBe(false);
  });
});
