// ============================================================
// QC TESTS — v1.0.38
// Client ke reported masail ko lock karne ke liye:
//   1. Weighing scale (Mettler Toledo Brite) ka data parsing
//   2. Weight item ki price calculation (crab @ 10/kg)
//   3. KOT par weight items ka label
//   4. KOT cancel clamp bug
// ============================================================
import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseScaleLine,
  computeWeightPrice,
  weightNote,
  loadScaleConfig,
  saveScaleConfig,
  extractComToken,
  matchPreferredPort,
  DEFAULT_SCALE_CONFIG,
  type SerialPortInfo,
} from '@/lib/weightScale';
import { kotQtyLabel } from '@/components/KitchenReceipt';

// Client ki machine ke asal ports (Device Manager screenshot se):
const CLIENT_PORTS: SerialPortInfo[] = [
  { portName: 'COM1', displayName: 'Communications Port (COM1)' },
  { portName: 'COM7', displayName: 'Standard Serial over Bluetooth link (COM7)' },
  { portName: 'COM8', displayName: 'Standard Serial over Bluetooth link (COM8)' },
  { portName: 'COM3', displayName: 'WCH PCI Express-SERIAL (COM3)' },
  { portName: 'COM4', displayName: 'WCH PCI Express-SERIAL (COM4)' },
];

describe('COM port selection — client ke do WCH serial ports (COM3/COM4)', () => {
  it('COM3 chunne par sahi WCH port milta hai', () => {
    const m = matchPreferredPort(CLIENT_PORTS, 'COM3');
    expect(m?.portName).toBe('COM3');
  });

  it('COM4 chunne par doosra WCH port milta hai (pehla nahi)', () => {
    const m = matchPreferredPort(CLIENT_PORTS, 'COM4');
    expect(m?.portName).toBe('COM4');
  });

  it('COM number sirf displayName me ho tab bhi match karta hai', () => {
    const ports: SerialPortInfo[] = [
      { portName: '', displayName: 'WCH PCI Express-SERIAL (COM4)' },
    ];
    expect(matchPreferredPort(ports, 'COM4')?.displayName).toContain('COM4');
  });

  it('preferred khali ho to koi match nahi (auto-fallback main process me)', () => {
    expect(matchPreferredPort(CLIENT_PORTS, '')).toBeUndefined();
  });

  it('mojood na hone wale port par undefined (fallback trigger hoga)', () => {
    expect(matchPreferredPort(CLIENT_PORTS, 'COM9')).toBeUndefined();
  });

  it('extractComToken spaces aur brackets handle karta hai', () => {
    expect(extractComToken('COM3')).toBe('COM3');
    expect(extractComToken('WCH PCI Express-SERIAL (COM3)')).toBe('COM3');
    expect(extractComToken('com 4')).toBe('COM4');
    expect(extractComToken('LPT3')).toBe('');
    expect(extractComToken(undefined)).toBe('');
  });
});

describe('parseScaleLine — Mettler Toledo Brite + generic protocols', () => {
  it('Brite ka standard stable frame parse karta hai', () => {
    const r = parseScaleLine('ST,GS, 1.250kg');
    expect(r).not.toBeNull();
    expect(r!.kg).toBe(1.25);
    expect(r!.stable).toBe(true);
    expect(r!.net).toBe(false); // GS = gross
  });

  it('unstable (US) frame ko stable=false mark karta hai', () => {
    const r = parseScaleLine('US,GS, 1.244kg');
    expect(r!.stable).toBe(false);
  });

  it('net weight (NT) pehchanta hai', () => {
    const r = parseScaleLine('ST,NT,+  0.500 kg');
    expect(r!.net).toBe(true);
    expect(r!.kg).toBe(0.5);
  });

  it('grams ko kg me convert karta hai', () => {
    expect(parseScaleLine('ST,GS, 1250 G')!.kg).toBe(1.25);
  });

  it('pounds ko kg me convert karta hai (LB word-boundary bug ka regression)', () => {
    // "2.500LB" me digit aur L ke darmiyan word-boundary nahi hoti —
    // pehle yeh 2.5 kg ban jata tha.
    const r = parseScaleLine('ST,GS, 2.500LB');
    expect(r!.kg).toBeCloseTo(1.134, 3);
  });

  it('comma decimal separator handle karta hai (EU scales)', () => {
    expect(parseScaleLine('ST,GS, 1,250kg')!.kg).toBe(1.25);
  });

  it('simple numeric output bhi chalta hai', () => {
    expect(parseScaleLine('1.234')!.kg).toBe(1.234);
  });

  it('khali / garbage lines par null deta hai', () => {
    expect(parseScaleLine('')).toBeNull();
    expect(parseScaleLine('   ')).toBeNull();
    expect(parseScaleLine('ERROR')).toBeNull();
  });

  it('range se bahar wazan reject karta hai (500kg se upar)', () => {
    expect(parseScaleLine('ST,GS, 9999.000kg')).toBeNull();
  });
});

describe('computeWeightPrice — crab @ rate/kg', () => {
  beforeEach(() => {
    saveScaleConfig({ ...DEFAULT_SCALE_CONFIG });
  });

  it('whole rounding (PKR default): 1.250kg @ 10 = 13', () => {
    saveScaleConfig({ priceRounding: 'whole' });
    expect(computeWeightPrice(1.25, 10, loadScaleConfig())).toBe(13);
  });

  it('decimal rounding ($): 1.250kg @ 10 = 12.50', () => {
    saveScaleConfig({ priceRounding: 'decimal' });
    expect(computeWeightPrice(1.25, 10, loadScaleConfig())).toBe(12.5);
  });

  it('rate na ho to 0 deta hai — NaN nahi (regression)', () => {
    expect(computeWeightPrice(1.25, undefined as unknown as number)).toBe(0);
    expect(computeWeightPrice(1.25, NaN)).toBe(0);
    expect(Number.isNaN(computeWeightPrice(1.25, 0))).toBe(false);
  });

  it('note me wazan aur rate dono hote hain (KOT + receipt par chhapta hai)', () => {
    expect(weightNote(1.25, 10)).toBe('1.250 KG @ 10/KG');
  });
});

describe('kotQtyLabel — KOT par weight items', () => {
  it('weight item par asal wazan dikhata hai, "1" nahi', () => {
    expect(kotQtyLabel({ quantity: 1, pricingType: 'weight', weightGrams: 1250 })).toBe('1.250 KG');
  });

  it('normal item par quantity hi dikhata hai', () => {
    expect(kotQtyLabel({ quantity: 3, pricingType: 'fixed' })).toBe('3');
  });

  it('weightGrams na ho to quantity par fallback', () => {
    expect(kotQtyLabel({ quantity: 2, pricingType: 'weight' })).toBe('2');
  });

  it('quantity missing/0/NaN par bhi khali nahi — fallback 1 (blank qty guard)', () => {
    expect(kotQtyLabel({ pricingType: 'fixed' } as any)).toBe('1');
    expect(kotQtyLabel({ quantity: 0, pricingType: 'fixed' })).toBe('1');
    expect(kotQtyLabel({ quantity: undefined, pricingType: 'fixed' } as any)).toBe('1');
    expect(kotQtyLabel({ quantity: NaN, pricingType: 'fixed' })).toBe('1');
  });
});

describe('KOT cancel clamp — printedQty ka hisaab', () => {
  // printQueue.ts ki asal logic ka aina. Pehle floor `it.quantity` tha,
  // is liye cancellation ka koi asar nahi hota tha aur cancelled item
  // agli KOT par dobara chhap jata tha.
  const applyCancel = (quantity: number, printed: number, cancelled: number) => {
    const next = Math.max(0, printed - cancelled);
    return Math.min(quantity, next);
  };

  it('cancel ke baad printedQty ghatti hai', () => {
    // 5 chhap chuke, 2 cancel hue, cart me ab 3 hain
    expect(applyCancel(3, 5, 2)).toBe(3);
  });

  it('poora cancel hone par printedQty 0 ho jati hai', () => {
    expect(applyCancel(0, 4, 4)).toBe(0);
  });

  it('printedQty kabhi current quantity se zyada nahi hoti', () => {
    expect(applyCancel(2, 10, 0)).toBe(2);
  });

  it('printedQty kabhi manfi nahi hoti', () => {
    expect(applyCancel(5, 1, 9)).toBe(0);
  });
});

import { htmlToPlainText } from '@/printing/escpos';

describe('ESC/POS KOT qty (network printers) — qty must not glue to item name', () => {
  it('separates item name and qty when flattened to text', () => {
    const row = '<div style="display:flex"><span style="flex:1">Chicken Biryani</span><span class="print-black-box">3</span></div>';
    const out = htmlToPlainText(row);
    // qty must be present AND separated from the name (not "Biryani3")
    expect(out).toContain('3');
    expect(out).not.toContain('Biryani3');
    expect(/Biryani\s+3/.test(out)).toBe(true);
  });

  it('keeps qty for an item that has a note', () => {
    const row = '<div><span style="flex:1">Zinger Burger<div>→ No mayo</div></span><span class="print-black-box">2</span></div>';
    const out = htmlToPlainText(row);
    expect(out).toContain('2');
    expect(out).toContain('No mayo');
  });
});
