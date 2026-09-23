// ============================================================
// CAFÉ RECEIPT TEMPLATES — Café Classic, Coffee House, Café Counter.
//
// Asked for by a Lahore café alongside "text too bold": lighter type,
// "2 × Item" lines, and a pickup number the counter can call out. The
// thirteen existing designs must print exactly as before.
// ============================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PremiumReceipt from '@/components/PremiumReceipt';
import {
  PREMIUM_TEMPLATES,
  isPremiumTemplateId,
  loadCustomization,
  saveCustomization,
  type PremiumTemplateId,
} from '@/lib/premiumReceiptTemplates';
import { buildSampleOrder } from '@/lib/sampleOrder';

const CAFE: PremiumTemplateId[] = ['premium-cafe-classic', 'premium-coffee-house', 'premium-cafe-counter'];
const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');
const settings: any = { name: 'Chai Corner', address: 'Main Boulevard', phone1: '0300-0000000', currencySymbol: 'Rs ', thankYouText: 'Thank You!' };

function slip(id: PremiumTemplateId, order = buildSampleOrder()) {
  const { container } = render(<PremiumReceipt order={order} settings={settings} templateId={id} />);
  const root = container.querySelector('.premium-receipt') as HTMLElement;
  return { root, text: root.textContent || '' };
}

beforeEach(() => localStorage.clear());

describe('the café designs are registered everywhere a design is picked', () => {
  it('in the template list, after the thirteen existing ones', () => {
    expect(PREMIUM_TEMPLATES).toHaveLength(16);
    expect(PREMIUM_TEMPLATES.slice(13).map(t => t.id)).toEqual(CAFE);
    expect(PREMIUM_TEMPLATES.slice(13).map(t => t.name)).toEqual(['Café Classic', 'Coffee House', 'Café Counter']);
    for (const id of CAFE) expect(isPremiumTemplateId(id)).toBe(true);
  });
  it('in the receipt-design setting type and the Settings picker', () => {
    const types = read('src/lib/types.ts');
    const picker = read('src/components/settings/ReceiptSettingsTab.tsx');
    for (const id of CAFE) {
      expect(types).toContain(`'${id}'`);
      expect(picker).toContain(`id: '${id}'`);
    }
  });
  it('the gallery no longer claims a fixed count of thirteen', () => {
    expect(read('src/components/PremiumTemplateGallery.tsx')).not.toMatch(/Thirteen professional/);
  });
});

describe('café item lines', () => {
  it('read "qty × item", with the amount on the same line at the right', () => {
    const { root } = slip('premium-cafe-classic');
    const rows = Array.from(root.querySelectorAll('tr.item-row'));
    expect(rows).toHaveLength(3);
    // One cell per item: the print stylesheet centres table cells vertically,
    // which would float the amount down beside the note instead of the name.
    expect(rows[0].querySelectorAll('td')).toHaveLength(1);
    const line = rows[0].querySelector('td > div') as HTMLElement;
    expect(line.style.display).toBe('flex');
    expect(line.children[0].textContent).toBe('2 × Chicken Biryani');
    expect(line.children[1].textContent).toBe('900.00');
    expect(line.children[1].className).toBe('premium-num');   // never wraps mid-number
  });
  it('show the unit price only when more than one was ordered', () => {
    const { root } = slip('premium-cafe-classic');
    const rows = Array.from(root.querySelectorAll('tr.item-row')).map(r => r.textContent || '');
    expect(rows[0]).toContain('@ 450.00 each');          // 2 × Biryani
    expect(rows[1]).not.toContain('each');                // 1 × Zinger
    expect(rows[2]).toContain('@ 120.00 each');           // 2 × Cold Drink
  });
  it('keep the variant and the kitchen note', () => {
    const { root } = slip('premium-cafe-classic');
    const rows = Array.from(root.querySelectorAll('tr.item-row')).map(r => r.textContent || '');
    expect(rows[1]).toContain('1 × Zinger Burger (Large)');
    expect(rows[0]).toContain('» Less spicy');
  });
  it('a weighed item shows its kilograms, not "1 ×"', () => {
    const order = buildSampleOrder();
    order.items = [{ id: 'w', menuItemId: 'm', name: 'Mutton Karahi', pricingType: 'weight', price: 3000, quantity: 1, weightGrams: 1250, lineTotal: 3000, note: '1.250 KG @ 2400/KG' } as any];
    const { root } = slip('premium-cafe-classic', order);
    const row = root.querySelector('tr.item-row')!.textContent || '';
    expect(row).toContain('1.250 kg × Mutton Karahi');
    expect(row).not.toContain('each');
    expect(row).toContain('3,000.00');
  });
  it('item notes can still be switched off', () => {
    saveCustomization('premium-cafe-classic', { showItemNotes: false });
    const { text } = slip('premium-cafe-classic');
    expect(text).not.toContain('Less spicy');
  });
});

describe('the pickup number', () => {
  it('prints the order number large, with the customer name under it — once', () => {
    const { root, text } = slip('premium-cafe-classic');
    expect(text).toContain('ORDER NUMBER');
    const hero = Array.from(root.querySelectorAll('div')).find(d => d.textContent?.startsWith('ORDER NUMBER'))!;
    expect(hero.textContent).toBe('ORDER NUMBER1042Ahmed Khan');
    expect(text.split('Ahmed Khan')).toHaveLength(2);    // not repeated in the details
    expect(text).not.toContain('Customer:');
  });
  it('without a customer it is just the number', () => {
    const order = buildSampleOrder();
    delete (order as any).customer;
    const { text } = slip('premium-cafe-counter', order);
    expect(text).toContain('ORDER NUMBER1042');
  });
  it('when the order number is hidden, the name goes back into the details', () => {
    saveCustomization('premium-cafe-classic', { showOrderNumber: false });
    const { text } = slip('premium-cafe-classic');
    expect(text).not.toContain('ORDER NUMBER');
    expect(text).toContain('Customer:Ahmed Khan');
  });
  it('Café Counter draws it as a ticket: dashed tear lines and a larger number', () => {
    const counter = slip('premium-cafe-counter').root;
    const classic = slip('premium-cafe-classic').root;
    const hero = (root: HTMLElement) => Array.from(root.querySelectorAll('div')).find(d => d.textContent?.startsWith('ORDER NUMBER'))!;
    expect(hero(counter).style.borderTop).toBe('2px dashed #000');
    expect(hero(counter).style.borderLeft).toBe('');
    expect(hero(classic).style.border).toBe('2px solid #000');
    const size = (root: HTMLElement) => parseInt((hero(root).children[1] as HTMLElement).style.fontSize, 10);
    expect(size(counter)).toBeGreaterThan(size(classic));
    expect(hero(counter).textContent).toBe('ORDER NUMBER1042Ahmed Khan');
  });
  it('Coffee House has no pickup block: the name stays in the details, and the title is GUEST CHECK', () => {
    const { text } = slip('premium-coffee-house');
    expect(text).not.toContain('ORDER NUMBER');
    expect(text).toContain('Customer:Ahmed Khan');
    expect(text).toContain('GUEST CHECK');
  });
});

describe('lighter type by default', () => {
  it('the café designs start with a regular body; the others stay bold as before', () => {
    for (const id of CAFE) expect(loadCustomization(id).boldBody).toBe(false);
    for (const t of PREMIUM_TEMPLATES.slice(0, 13)) expect(loadCustomization(t.id).boldBody).toBe(true);
    expect(slip('premium-cafe-classic').root.style.fontWeight).toBe('400');
    expect(slip('premium-paid-banner').root.style.fontWeight).toBe('700');
  });
  it('a shop can still turn bold body on, and it sticks', () => {
    saveCustomization('premium-coffee-house', { boldBody: true });
    expect(loadCustomization('premium-coffee-house').boldBody).toBe(true);
    expect(slip('premium-coffee-house').root.style.fontWeight).toBe('700');
  });
  it('no solid black blocks: no reversed bars in any café design', () => {
    for (const id of CAFE) expect(slip(id).root.querySelector('.dt-reverse')).toBeNull();
  });
  it('the typeface and size each design starts with', () => {
    expect(loadCustomization('premium-coffee-house')).toMatchObject({ fontFamily: 'serif', fontSize: 14 });
    expect(loadCustomization('premium-cafe-classic')).toMatchObject({ fontFamily: 'sans', fontSize: 13 });
  });
});

describe('every café design prints a complete bill', () => {
  it.each(CAFE)('%s carries the items, the totals, the payment and the thank-you line', (id) => {
    const { root, text } = slip(id);
    expect(root.querySelectorAll('tr.item-row')).toHaveLength(3);
    for (const want of ['Subtotal', 'Eid Discount', 'Tax', 'Service Charge', 'TOTAL', 'Rs 1,827.00', 'CASH', 'Change', 'Thank You!', 'Chai Corner']) {
      expect(text).toContain(want);
    }
    expect(root.querySelectorAll('.grand-total')).toHaveLength(1);
  });
});
