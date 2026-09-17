// Offline license key format — encode / sign / verify round-trip.
import { describe, it, expect } from 'vitest';
import {
  mintLicenseKey, verifyLicenseKey, isLegacyKeyFormat, normalizeKey,
  KEY_ALPHABET, PLAN_CODES,
} from '@/licensing/licenseKey';

describe('offline license key', () => {
  it('mints a key in the DTPOS-XXXX-XXXX-XXXX-XXXX shape', async () => {
    const { key } = await mintLicenseKey({ plan: 'monthly' });
    expect(key).toMatch(/^DTPOS(-[A-Z0-9]{4}){4}$/);
    for (const ch of key.replace(/^DTPOS-/, '').replace(/-/g, '')) {
      expect(KEY_ALPHABET).toContain(ch);
    }
  });

  it('round-trips plan, device count and expiry', async () => {
    for (const plan of PLAN_CODES) {
      const { key, payload } = await mintLicenseKey({ plan, maxDevices: 3 });
      const check = await verifyLicenseKey(key);
      expect(check.ok).toBe(true);
      if (!check.ok) return;
      expect(check.payload.plan).toBe(plan);
      expect(check.payload.maxDevices).toBe(3);
      expect(check.payload.expiryDate).toBe(payload.expiryDate);
      if (plan === 'lifetime') expect(check.payload.expiryDate).toBeNull();
      else expect(check.payload.expiryDate).toBeGreaterThan(Date.now());
    }
  });

  it('accepts lower case and missing dashes', async () => {
    const { key } = await mintLicenseKey({ plan: 'yearly' });
    const messy = key.toLowerCase().replace(/-/g, ' ');
    const check = await verifyLicenseKey(messy);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.key).toBe(key);
  });

  it('rejects an invented key', async () => {
    const check = await verifyLicenseKey('DTPOS-ABCD-EFGH-JKLM-NPQR');
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe('signature');
  });

  it('rejects a key with one character changed', async () => {
    const { key } = await mintLicenseKey({ plan: 'quarterly' });
    const idx = key.length - 1;
    const other = key[idx] === 'A' ? 'B' : 'A';
    const tampered = key.slice(0, idx) + other;
    const check = await verifyLicenseKey(tampered);
    expect(check.ok).toBe(false);
  });

  it('rejects the wrong length', async () => {
    const check = await verifyLicenseKey('DTPOS-ABCD-EFGH');
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe('format');
  });

  it('recognises pre-1.0.40 online keys and explains them', async () => {
    expect(isLegacyKeyFormat('DTPOS-PRO-ABCD-EFGH-JKLM')).toBe(true);
    const check = await verifyLicenseKey('DTPOS-PRO-ABCD-EFGH-JKLM');
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.reason).toBe('legacy');
      expect(check.message).toMatch(/offline activation key/i);
    }
  });

  it('honours an explicit day count', async () => {
    const { payload } = await mintLicenseKey({ plan: 'monthly', days: 45 });
    const days = Math.round(((payload.expiryDate as number) - Date.now()) / 86400000);
    expect(days).toBeGreaterThanOrEqual(44);
    expect(days).toBeLessThanOrEqual(46);
  });

  it('normalizeKey strips separators', () => {
    expect(normalizeKey('dtpos-ab cd_ef')).toBe('DTPOSABCDEF');
  });
});
