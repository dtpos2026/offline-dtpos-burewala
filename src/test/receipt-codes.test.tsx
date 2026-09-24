// ============================================================
// RECEIPT QR & BARCODE — Settings → Receipt → QR & Barcode.
//
// The printed codes were also decoded from the simulator's printer dots with
// ZXing and jsQR on all 41 receipt designs (every position, mode, size and
// format); these tests pin the pieces that makes work.
// ============================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { createRequire } from 'node:module';
import { encodeCode128, encodeCode39, code128Values, sanitizeForFormat } from '@/lib/linearBarcode';
import {
  readReceiptCodes, receiptRef, parseReceiptRef, findOrderByRef, qrValueFor, barcodeValueFor,
  receiptPayload, receiptText, fromBase64Url, normalizeLink, safeHttpUrl, qrCaption, DEFAULT_SCAN_PAGE,
} from '@/lib/receiptCodes';
import { barcodeLayout, qrLayout } from '@/components/ReceiptCodes';
import ReceiptPreview from '@/components/ReceiptPreview';
import ReceiptCodesCard from '@/components/settings/ReceiptCodesCard';
import { buildSampleOrder } from '@/lib/sampleOrder';

const require_ = createRequire(import.meta.url);
const { packDots, mapRegions, rasterGeometry } = require_('../../electron/escposRaster.cjs');

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
const order = { ...buildSampleOrder(), createdAt: '2026-09-24T10:53:00' } as any;
const shop: any = { name: 'Chai Corner', phone1: '0300-0000000', currencySymbol: 'Rs ', paperSize: '80mm', receiptDesign: 'classic' };
const withCodes = (codes: any) => ({ ...shop, receiptCodes: codes });

beforeEach(() => localStorage.clear());

describe('barcode encoders', () => {
  it('Code 128 packs digit runs two per symbol and checks out (mod 103)', () => {
    // Start B, "R", Code C, 26 09 24 10 42, checksum
    const v = code128Values('R2609241042');
    expect(v.slice(0, 3)).toEqual([104, 50, 99]);
    expect(v.slice(3, 8)).toEqual([26, 9, 24, 10, 42]);
    const sum = v.slice(0, -1).reduce((a, x, i) => a + (i === 0 ? x : x * i), 0);
    expect(v[v.length - 1]).toBe(sum % 103);
    // every symbol is 11 modules, the stop 13
    expect(encodeCode128('R2609241042').modules).toBe(9 * 11 + 13);
  });
  it('Code 39 upper-cases and frames with *', () => {
    const b = encodeCode39('abc-1');
    expect(b.text).toBe('ABC-1');
    expect(b.widths.length).toBe(7 * 10 - 1); // 7 chars × (9 + gap) − last gap
  });
  it('custom text keeps only what the format can carry', () => {
    expect(sanitizeForFormat('code39', 'Chai*Khass #1!')).toBe('CHAIKHASS 1');
    expect(sanitizeForFormat('code128', 'Wi-Fi: پاس 123')).toBe('Wi-Fi:  123');
  });
});

describe('what the codes carry', () => {
  it('the receipt reference is R + date + bill number, optionally prefixed, and reads back', () => {
    expect(receiptRef(order)).toBe('R2609241042');
    expect(receiptRef(order, 'lhr-1')).toBe('LHR1-R2609241042');
    expect(parseReceiptRef('lhr1-r2609241042')).toEqual({ prefix: 'LHR1', yy: 26, mm: 9, dd: 24, orderNumber: 1042 });
    expect(parseReceiptRef('8961234567890')).toBeNull(); // an item barcode
    const other = { ...order, orderNumber: 1042, createdAt: '2026-09-23T10:00:00' };
    expect(findOrderByRef([other, order], 'R2609241042')).toBe(order);
    expect(findOrderByRef([other], 'R2609241042')).toBeNull();
  });
  it('the automatic QR opens the receipt page with the bill — and never the customer', () => {
    const cfg = readReceiptCodes(withCodes({ qr: { enabled: true, mode: 'auto' } }));
    const url = qrValueFor(order, shop, cfg)!;
    expect(url.startsWith(`${DEFAULT_SCAN_PAGE}#r=`)).toBe(true);
    const data = JSON.parse(fromBase64Url(url.split('#r=')[1]));
    expect(data).toMatchObject({ v: 1, s: 'Chai Corner', n: '1042', t: '2026-09-24 10:53', p: 'paid', T: 1827, r: 'R2609241042' });
    expect(data.i).toEqual([['Chicken Biryani', 2, 900], ['Zinger Burger (Large)', 1, 550], ['Cold Drink 500ml', 2, 240]]);
    const raw = JSON.stringify(data);
    expect(raw).not.toContain('Ahmed');
    expect(raw).not.toContain('0300-1234567');
    expect(raw).not.toContain('Main Boulevard');
  });
  it('a long bill lists the first items and counts the rest', () => {
    const big = { ...order, items: Array.from({ length: 40 }, (_, i) => ({ id: `i${i}`, name: `Special Family Platter ${i}`, pricingType: 'fixed', price: 1000, quantity: 1, lineTotal: 1000 })) };
    const p = receiptPayload(big, shop);
    expect((p.i as unknown[]).length).toBeLessThan(40);
    expect((p.i as unknown[]).length + Number(p['+'])).toBe(40);
    expect(new TextEncoder().encode(JSON.stringify(p)).length).toBeLessThanOrEqual(300);
  });
  it('text view: the bill as plain text, readable with no internet', () => {
    const t = receiptText(order, shop, 'R2609241042');
    expect(t).toContain('Bill #1042');
    expect(t).toContain('2 x Chicken Biryani  900.00');
    expect(t).toContain('Total: Rs 1,827.00 · Paid (CASH)');
    expect(t).not.toContain('Ahmed');
  });
  it('multi-link: valid links only, in order; WhatsApp numbers become wa.me', () => {
    const cfg = readReceiptCodes(withCodes({ qr: { enabled: true, mode: 'multi', links: [
      { id: 'a', type: 'google', url: 'https://g.page/r/abc/review' },
      { id: 'b', type: 'whatsapp', url: '0300 1234567', label: 'Order now' },
      { id: 'c', type: 'website', url: 'javascript:alert(1)' },
    ] } }));
    const data = JSON.parse(fromBase64Url(qrValueFor(order, shop, cfg)!.split('#l=')[1]));
    expect(data.k).toEqual([['google', 'https://g.page/r/abc/review'], ['whatsapp', 'https://wa.me/923001234567', 'Order now']]);
  });
  it('single-link: the QR is the link itself; bad links print nothing', () => {
    const on = (url: string) => readReceiptCodes(withCodes({ qr: { enabled: true, mode: 'single', singleUrl: url } }));
    expect(qrValueFor(order, shop, on('facebook.com/chaicorner'))).toBe('https://facebook.com/chaicorner');
    expect(qrValueFor(order, shop, on('0300 1234567'))).toBe('https://wa.me/923001234567');
    expect(qrValueFor(order, shop, on('not a link'))).toBeNull();
    expect(qrCaption(on('https://instagram.com/x'))).toBe('Scan to follow us on Instagram');
  });
  it('links are refused unless they are http(s) — and a phone number is not a website', () => {
    expect(safeHttpUrl('data:text/html,hi')).toBeNull();
    expect(safeHttpUrl('https://03001234567')).toBeNull();
    expect(normalizeLink('website', 'example.com/menu')).toBe('https://example.com/menu');
  });
  it('switched off, nothing is generated', () => {
    const cfg = readReceiptCodes(shop);
    expect(cfg.qr.enabled).toBe(false);
    expect(cfg.barcode.enabled).toBe(false);
    expect(qrValueFor(order, shop, cfg)).toBeNull();
    expect(barcodeValueFor(order, cfg)).toBeNull();
  });
});

describe('printed sizes are whole printer dots', () => {
  it('QR modules are 2+ dots and the code fits the slip', () => {
    const l = qrLayout('https://example.com/scan.html#r=abc', 32, 64)!;
    expect(Number.isInteger(l.dotsPerModule)).toBe(true);
    expect(l.dotsPerModule).toBeGreaterThanOrEqual(2);
    expect(l.widthMm * 8).toBe(l.modules * l.dotsPerModule);
    expect(l.widthMm).toBeLessThanOrEqual(64);
  });
  it('barcode bars narrow to fit, and Code 39 too wide for the paper falls back to Code 128', () => {
    const medium = barcodeLayout('code128', 'R2609241042', 'medium', 64)!;
    expect(medium.dotsPerModule).toBe(3);
    const c39 = barcodeLayout('code39', 'LHR1-R2609241042', 'small', 64)!;
    expect(c39.fellBack).toBe(true);
    expect(c39.barcode.format).toBe('code128');
    expect(c39.widthDots).toBeLessThanOrEqual(64 * 8);
  });
});

describe('on the bill', () => {
  const codesAt = (position: string) => ({ qr: { enabled: true, mode: 'auto', position }, barcode: { enabled: true, position } });
  it.each(['above', 'footer', 'below'])('%s: one QR and one barcode on the printed node', (position) => {
    render(<ReceiptPreview order={order} settings={withCodes(codesAt(position))} showPrintButton={false} />);
    const print = document.querySelector('.receipt-print-portal .print-receipt') as HTMLElement;
    const blocks = print.querySelectorAll(`.dt-receipt-codes[data-position="${position}"]`);
    expect(blocks).toHaveLength(1);
    expect(print.querySelectorAll('.dt-receipt-codes svg[aria-label="QR code"]')).toHaveLength(1);
    expect(print.querySelector('.dt-receipt-codes svg[aria-label^="Barcode R2609241042"]')).not.toBeNull();
  });
  it('the new QR replaces the old automatic one; switched off, the bill is exactly as before', () => {
    render(<ReceiptPreview order={order} settings={withCodes(codesAt('footer'))} showPrintButton={false} />);
    const print = document.querySelector('.receipt-print-portal .print-receipt') as HTMLElement;
    expect(print.querySelectorAll('svg').length).toBe(2); // new QR + barcode, no legacy QR
  });
  it('the old automatic QR no longer carries the customer', () => {
    const src = require_('node:fs').readFileSync(require_('node:path').resolve(__dirname, '../components/ReceiptPreview.tsx'), 'utf8');
    const block = src.slice(src.indexOf('const qrData = JSON.stringify({'), src.indexOf('});', src.indexOf('const qrData = JSON.stringify({')));
    expect(block).not.toMatch(/customer/);
  });
});

describe('the image route prints codes dot-exact', () => {
  // A 3-dot module whose edges fall mid-dot: half-covered edge dots.
  function strip(offsetHalf: boolean) {
    const width = 16, height = 1;
    const px = Buffer.alloc(width * height * 4, 255);
    const paint = (x: number, v: number) => { px[x * 4] = v; px[x * 4 + 1] = v; px[x * 4 + 2] = v; px[x * 4 + 3] = 255; };
    if (offsetHalf) { paint(4, 128); paint(5, 0); paint(6, 0); paint(7, 128); } // dark module 4.5..7.5
    else { paint(4, 0); paint(5, 0); paint(6, 0); }
    return { px, width, height };
  }
  const dots = (packed: any, n: number) => Array.from({ length: n }, (_, x) => (packed.data[x >> 3] >> (7 - (x & 7))) & 1).join('');
  const geom = { ...rasterGeometry('80mm', 0, 0), leftDots: 0 };
  it('text rule: a half-covered edge dot prints on BOTH sides (the 4/2 fault)', () => {
    const { px, width, height } = strip(true);
    expect(dots(packDots(px, width, height, geom, { darkness: 6 }), 10)).toBe('0000111100');
  });
  it('inside a code region the module keeps its 3 dots', () => {
    const { px, width, height } = strip(true);
    const exactRegions = [{ x0: 0, x1: width, y0: 0, y1: height }];
    expect(dots(packDots(px, width, height, geom, { darkness: 6, exactRegions }), 10)).toBe('0000111000');
    const aligned = strip(false);
    expect(dots(packDots(aligned.px, width, height, geom, { darkness: 6, exactRegions }), 10)).toBe('0000111000');
  });
  it('regions follow the crop and resize the capture goes through', () => {
    expect(mapRegions([{ x: 110, y: 20, width: 100, height: 50 }], { x: 10, y: 10, width: 200, height: 100 }, 100, 50))
      .toEqual([{ x0: 49, x1: 100, y0: 4, y1: 31 }]);
  });
});

describe('the settings card', () => {
  function Harness() {
    const [s, setS] = useState<any>({ ...shop });
    return (
      <>
        <ReceiptCodesCard settings={s} setSettings={setS} onSave={() => {}} sampleOrder={order} />
        <output data-testid="saved">{JSON.stringify(s.receiptCodes || null)}</output>
      </>
    );
  }
  const saved = () => JSON.parse(screen.getByTestId('saved').textContent || 'null');
  it('switches, modes, links and position write the settings; the preview shows the codes', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('switch', { name: 'QR code on receipts' }));
    expect(saved().qr.enabled).toBe(true);
    fireEvent.click(screen.getByText('Multi-link QR'));
    fireEvent.click(screen.getByRole('button', { name: /Add link/ }));
    fireEvent.change(screen.getByLabelText('Link'), { target: { value: 'https://g.page/r/abc/review' } });
    expect(saved().qr.mode).toBe('multi');
    expect(saved().qr.links[0]).toMatchObject({ type: 'google', url: 'https://g.page/r/abc/review' });
    fireEvent.click(screen.getByRole('switch', { name: 'Barcode on receipts' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Below receipt' })[1]);
    expect(saved().barcode).toMatchObject({ enabled: true, position: 'below', format: 'code128', content: 'receipt' });
    // the live preview carries both codes
    expect(document.querySelectorAll('.receipt-print-portal .dt-receipt-codes svg').length).toBeGreaterThanOrEqual(2);
  });
});
