// ============================================================
// PREMIUM PAYMENT SCREEN — same payment, a clearer layout, and a
// "Print receipt" box for the one bill being paid.
//
// Pinned:
//   • Premium is the default; "Classic" brings the earlier popup back;
//   • big Total Payable, method tiles, Exact + note buttons above the amount due,
//     Change and Due (Credit) side by side, Back to cart + Complete Sale (Enter);
//   • the result is the same as the classic popup's (cash, change, partial), plus
//     printReceipt when the box is shown;
//   • the print queue honours that box for one bill: unticked → no receipt (the
//     tandoor token still prints), ticked → a receipt even when Settings say none;
//   • the POS passes the box's default and reads the choice once per bill.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Order } from '@/lib/types';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const STORE_KEY = 'desi-pos-data';
function seed(settings: Record<string, unknown> = {}) {
  localStorage.setItem(STORE_KEY, JSON.stringify({
    orders: [], menuItems: [], inventory: [], stockLogs: [], customers: [], recipes: [], tables: [], users: [], categories: [],
    paymentAccounts: [], settings: { name: 'Test', kotEnabled: true, ...settings }, orderCounter: 0,
  }));
}

beforeEach(() => { localStorage.clear(); vi.resetModules(); cleanup(); });
afterEach(() => cleanup());

describe('note suggestions', () => {
  it('the next round notes above the amount due', async () => {
    const { suggestedNotes } = await import('@/components/PaymentDialog');
    expect(suggestedNotes(1952)).toEqual([2000, 5000]);
    expect(suggestedNotes(2140)).toEqual([2200, 2500, 3000, 5000].slice(-3));
    expect(suggestedNotes(0)).toEqual([]);
  });
});

describe('the premium screen', () => {
  const open = async (props: Record<string, unknown> = {}, settings: Record<string, unknown> = {}) => {
    seed(settings);
    const { default: PaymentDialog } = await import('@/components/PaymentDialog');
    const onConfirm = vi.fn();
    render(<PaymentDialog open grandTotal={1952} onClose={() => {}} onConfirm={onConfirm} {...props} />);
    return onConfirm;
  };

  it('is the default, with the reference layout', async () => {
    await open({ defaultPrintReceipt: true });
    expect(document.querySelector('[data-pay-premium]')).toBeTruthy();
    expect(document.querySelector('[data-pay-total]')!.textContent).toMatch(/Total Payable\s*Rs\. 1,952/);
    expect(screen.getByRole('radio', { name: /Cash/ })).toHaveAttribute('aria-checked', 'true');
    expect(Array.from(document.querySelectorAll('[data-pay-note]')).map(b => b.textContent)).toEqual(['2,000', '5,000']);
    expect(screen.getByRole('button', { name: 'Back to cart' })).toBeTruthy();
    expect(document.querySelector('[data-pay-complete]')!.textContent).toMatch(/Complete Sale/);
    expect((document.querySelector('[data-pay-print]') as HTMLInputElement).checked).toBe(true);
  });

  it('cash with change; Enter completes; the print box travels with the result', async () => {
    const onConfirm = await open({ defaultPrintReceipt: true });
    fireEvent.click(document.querySelector('[data-pay-note="5000"]')!);
    expect(document.querySelector('[data-pay-change]')!.textContent).toMatch(/Rs\. 3,048/);
    expect(document.querySelector('[data-pay-due]')!.textContent).toMatch(/Rs\. 0/);
    fireEvent.click(document.querySelector('[data-pay-print]')!);
    fireEvent.keyDown(document.querySelector('[data-pay-amount]')!, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0]).toMatchObject({ method: 'cash', cashReceived: 5000, totalReceived: 1952, printReceipt: false });
  });

  it('less than the total is a partial payment, with the credit due shown', async () => {
    const onConfirm = await open();
    fireEvent.change(document.querySelector('[data-pay-amount]')!, { target: { value: '1000' } });
    expect(document.querySelector('[data-pay-due]')!.textContent).toMatch(/Rs\. 952/);
    expect(document.querySelector('[data-pay-complete]')!.textContent).toMatch(/Partial Pay · Rs\. 1,000 \(Due Rs\. 952\)/);
    fireEvent.click(document.querySelector('[data-pay-complete]')!);
    expect(onConfirm.mock.calls[0][0]).toMatchObject({ totalReceived: 1000 });
    expect('printReceipt' in onConfirm.mock.calls[0][0]).toBe(false); // no box shown → nothing decided
  });

  it('Online and Split wait for a payment account', async () => {
    await open();
    expect(screen.getByRole('radio', { name: /Online/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Split/ })).toBeDisabled();
  });

  it('"Classic" in Settings brings the earlier popup back', async () => {
    await open({ defaultPrintReceipt: true }, { paymentDialogStyle: 'classic' });
    expect(document.querySelector('[data-pay-premium]')).toBeNull();
    expect(screen.getByText(/Payment Receive/)).toBeTruthy();
  });
});

describe('the print queue honours "Print receipt" for one bill', () => {
  const bill = (): Order => ({
    id: 'o1', orderNumber: 7, orderType: 'takeaway', status: 'paid',
    items: [{ id: 'l1', menuItemId: 'm1', name: 'Zinger', price: 600, quantity: 1, lineTotal: 600 }],
    subtotal: 600, discount: 0, tax: 0, serviceCharge: 0, serviceChargePercent: 0, grandTotal: 600, amountPaid: 600,
    createdAt: new Date().toISOString(), notes: '',
  } as unknown as Order);

  it('unticked: no receipt', async () => {
    seed();
    const q = await import('@/lib/printQueue');
    const r = q.printReceiptAfterPayment(bill(), { receipt: false });
    expect(r).toEqual({ decision: 'skip-all', queued: false });
    expect(q.getPrintQueue().filter(j => j.printType === 'receipt')).toHaveLength(0);
  });
  it('ticked: a receipt, even when Settings say "no receipt on pay"', async () => {
    seed({ noReceiptOnPay: true });
    const q = await import('@/lib/printQueue');
    expect(q.printReceiptAfterPayment(bill(), { receipt: true })).toEqual({ decision: 'print', queued: true });
    expect(q.getPrintQueue().filter(j => j.printType === 'receipt')).toHaveLength(1);
  });
  it('no choice: Settings decide, as before', async () => {
    seed({ noReceiptOnPay: true });
    const q = await import('@/lib/printQueue');
    expect(q.printReceiptAfterPayment(bill()).decision).toBe('skip-all');
  });
});

describe('wired into the POS', () => {
  const pos = read('pages/POSScreen.tsx');
  it('passes the box’s default and reads the choice once per bill', () => {
    expect(pos).toMatch(/defaultPrintReceipt=\{receiptOnPay\(\{ orderType \}, settings\) === 'print'\}/);
    expect(pos).toMatch(/printChoiceRef\.current = r\.printReceipt;/);
    expect(pos.match(/const choice = takePrintChoice\(\);/g)).toHaveLength(2);
    expect(pos.match(/printReceiptAfterPayment\((updated|order), choice\)/g)).toHaveLength(2);
    expect(pos).toMatch(/printChoiceRef\.current = undefined; \/\/ a choice left from an earlier popup never carries over/);
  });
  it('Settings offers Premium and Classic', () => {
    const card = read('components/settings/PosEntryCard.tsx');
    expect(card).toMatch(/onChange\(\{ paymentDialogStyle: id \}\)/);
  });
});
