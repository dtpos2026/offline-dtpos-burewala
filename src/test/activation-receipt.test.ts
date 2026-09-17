// ============================================================
// ACTIVATION RECEIPT — the offline bridge between a shop's POS and the
// Super Admin panel's client registry + device map.
// ============================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { mintLicenseKey } from '@/licensing/licenseKey';
import { activate, buildActivationReceipt } from '@/licensing/licenseService';
import { encodeReceipt, decodeReceipt, RECEIPT_PREFIX } from '@/licensing/activationReceipt';

describe('activation receipt', () => {
  beforeEach(() => { localStorage.clear(); });

  it('is produced after an activation and carries the shop back to the panel', async () => {
    const { key } = await mintLicenseKey({ plan: 'monthly', maxDevices: 2 });
    const r = await activate(
      { licenseKey: key, businessName: 'Al-Madina Restaurant', ownerName: 'Bilal', mobileNumber: '03012345678' },
      '1.0.40',
    );
    expect(r.ok).toBe(true);

    const code = await buildActivationReceipt();
    expect(code).toBeTruthy();
    expect(code!.startsWith(RECEIPT_PREFIX + '.')).toBe(true);

    const back = await decodeReceipt(code!);
    expect(back.ok).toBe(true);
    expect(back.receipt!.key).toBe(key);
    expect(back.receipt!.business).toBe('Al-Madina Restaurant');
    expect(back.receipt!.owner).toBe('Bilal');
    expect(back.receipt!.phone).toBe('03012345678');
    expect(back.receipt!.plan).toBe('monthly');
    expect(back.receipt!.device).toBeTruthy();
  });

  it('round-trips coordinates so the device can be mapped', async () => {
    const code = await encodeReceipt({
      key: 'DTPOS-AAAA-BBBB-CCCC-DDDD', device: 'HW-TEST', business: 'Shop',
      owner: 'Owner', phone: '0300', plan: 'yearly', at: Date.now(),
      lat: 30.157500, lng: 71.524900, ver: '1.0.40',
    });
    const back = await decodeReceipt(code);
    expect(back.ok).toBe(true);
    expect(back.receipt!.lat).toBeCloseTo(30.1575, 5);
    expect(back.receipt!.lng).toBeCloseTo(71.5249, 5);
  });

  it('still works when the shop refused location', async () => {
    const code = await encodeReceipt({
      key: 'DTPOS-AAAA-BBBB-CCCC-DDDD', device: 'HW-TEST', business: 'Shop',
      owner: 'Owner', phone: '0300', plan: 'trial', at: Date.now(),
    });
    const back = await decodeReceipt(code);
    expect(back.ok).toBe(true);
    expect(back.receipt!.lat).toBeUndefined();
    expect(back.receipt!.lng).toBeUndefined();
  });

  it('rejects a code somebody edited', async () => {
    const code = await encodeReceipt({
      key: 'DTPOS-AAAA-BBBB-CCCC-DDDD', device: 'HW-TEST', business: 'Shop',
      owner: 'Owner', phone: '0300', plan: 'monthly', at: Date.now(),
    });
    const tampered = code.slice(0, -3) + 'AAA';
    const back = await decodeReceipt(tampered);
    expect(back.ok).toBe(false);
    expect(back.message).toMatch(/altered/i);
  });

  it('rejects an invented code and explains itself', async () => {
    for (const bad of ['', 'hello', 'DTR1.abc', 'DTR2.abc.def']) {
      const back = await decodeReceipt(bad);
      expect(back.ok).toBe(false);
      expect(back.message).toBeTruthy();
    }
  });

  it('returns nothing when the machine is not activated', async () => {
    expect(await buildActivationReceipt()).toBeNull();
  });
});
