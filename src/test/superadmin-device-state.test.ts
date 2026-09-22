// ============================================================
// SUPER ADMIN — device state wording.
//
// "Do not fake real-time" / "Do not fabricate exact GPS locations":
// online means the POS actually reported recently, and a location is
// labelled for what it is.
// ============================================================
import { describe, it, expect } from 'vitest';
import { isOnline, lastSeenLabel, locationLabel, serverDecision, ONLINE_WINDOW_MS } from '../../superadmin/src/deviceState';

const NOW = 1_800_000_000_000;

describe('online / offline', () => {
  it('online only within the heartbeat window', () => {
    expect(isOnline({ lastSyncAt: NOW - 60_000 }, NOW)).toBe(true);
    expect(isOnline({ lastSyncAt: NOW - ONLINE_WINDOW_MS - 1 }, NOW)).toBe(false);
    expect(isOnline({}, NOW)).toBe(false);
  });

  it('last seen reads naturally', () => {
    expect(lastSeenLabel(undefined, NOW)).toBe('Never reported');
    expect(lastSeenLabel(NOW - 10_000, NOW)).toBe('Just now');
    expect(lastSeenLabel(NOW - 25 * 60_000, NOW)).toBe('25 min ago');
    expect(lastSeenLabel(NOW - 5 * 3600_000, NOW)).toBe('5 h ago');
    expect(lastSeenLabel(NOW - 4 * 86400_000, NOW)).toBe('4 days ago');
  });
});

describe('location wording', () => {
  it('no data → "Location unavailable", never a guessed point', () => {
    expect(locationLabel({ deviceId: 'x' })).toBe('Location unavailable');
    expect(locationLabel({ deviceId: 'x', latitude: 0, longitude: 0 })).toBe('Location unavailable');
  });
  it('network positions are marked approximate', () => {
    expect(locationLabel({ deviceId: 'x', city: 'Burewala', country: 'Pakistan', locationSource: 'network' }))
      .toBe('Burewala, Pakistan (approximate, from internet connection)');
  });
  it('device positions show their accuracy', () => {
    expect(locationLabel({ deviceId: 'x', city: 'Burewala', locationSource: 'device', locationAccuracyM: 41.6, latitude: 30.1, longitude: 72.6 }))
      .toBe('Burewala (±42 m)');
  });
});

describe('server decision shown to the admin', () => {
  it('matches the POS priority: device revoke beats licence suspend', () => {
    expect(serverDecision({ status: 'revoked' }, { status: 'suspended' }, {})).toEqual({ status: 'revoked', scope: 'device' });
    expect(serverDecision(undefined, { status: 'pending' }, {})).toEqual({ status: 'pending', scope: 'licence' });
    expect(serverDecision({ status: 'active' }, undefined, {})).toEqual({ status: 'active', scope: 'none' });
  });
  it('a removal older than the latest activation is shown as superseded', () => {
    expect(serverDecision({ status: 'deleted', updatedAt: 100 }, undefined, { lastActivationAt: 200 }).status).toBe('active');
    expect(serverDecision({ status: 'deleted', updatedAt: 300 }, undefined, { lastActivationAt: 200 }).status).toBe('deleted');
  });
});
