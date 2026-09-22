// Pure verdict rules (src/licensing/licenseVerdict.ts).
import { describe, it, expect } from 'vitest';
import { computeVerdict, decideSlot, slotPolicy, isSupersededTombstone } from '@/licensing/licenseVerdict';

const base = { license: null, device: null, slot: 'confirmed' as const, lastActivationAt: 1000, now: 5000 };

describe('computeVerdict', () => {
  it('no records → active', () => {
    expect(computeVerdict(base).status).toBe('active');
  });
  it('strictest wins, and the scope says which record decided', () => {
    expect(computeVerdict({ ...base, license: { status: 'suspended' }, device: { status: 'revoked' } })).toMatchObject({ status: 'revoked', scope: 'device' });
    expect(computeVerdict({ ...base, license: { status: 'pending' }, slot: 'denied' })).toMatchObject({ status: 'pending', scope: 'license' });
    expect(computeVerdict({ ...base, slot: 'denied' })).toMatchObject({ status: 'device-limit', scope: 'slot' });
  });
  it('an old removal record does not block a newer activation', () => {
    expect(computeVerdict({ ...base, device: { status: 'deleted', updatedAt: 900 } }).status).toBe('active');
    expect(computeVerdict({ ...base, device: { status: 'deleted', updatedAt: 1100 } }).status).toBe('deleted');
  });
  it('status text is case-insensitive', () => {
    expect(computeVerdict({ ...base, license: { status: 'SUSPENDED' } }).status).toBe('suspended');
  });
  it('isSupersededTombstone only applies to deleted', () => {
    expect(isSupersededTombstone({ status: 'revoked', updatedAt: 1 }, 10)).toBe(false);
    expect(isSupersededTombstone({ status: 'deleted', updatedAt: 1 }, undefined)).toBe(false);
  });
});

describe('device slots', () => {
  it('present / append / full', () => {
    expect(decideSlot(['A'], 'A', 1, false).outcome).toBe('present');
    expect(decideSlot(['A'], 'B', 2, false).outcome).toBe('append');
    expect(decideSlot(['A', 'B'], 'C', 2, false)).toEqual({ outcome: 'full', used: 2, max: 2 });
    expect(decideSlot(['A', 'B'], 'C', 2, true).outcome).toBe('append');
    expect(decideSlot(['A', 'A', ''], 'B', 2, false).outcome).toBe('append'); // duplicates / blanks ignored
  });
  it('policy: legacy installs are grandfathered, new activations are enforced', () => {
    expect(slotPolicy(undefined)).toEqual({ needsClaim: true, allowOverLimit: true });
    expect(slotPolicy('pending')).toEqual({ needsClaim: true, allowOverLimit: false });
    expect(slotPolicy('denied')).toEqual({ needsClaim: true, allowOverLimit: false });
    expect(slotPolicy('confirmed').needsClaim).toBe(false);
  });
});
