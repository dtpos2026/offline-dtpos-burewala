// ============================================================
// The reported flow, on the real Super Admin screen:
//   POS "Activation complete" code → Super Admin → Device Map →
//   paste code → Register device → the client record is written to cloud.
// Before the fix this showed "Cloud: Function setDoc() called with invalid
// data. Unsupported field value: undefined (found in document clients/…)".
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, writeBatch } from 'firebase/firestore';
import { mintLicenseKey } from '@/licensing/licenseKey';
import { encodeReceipt } from '@/licensing/activationReceipt';

const cloudWrites = vi.hoisted(() => [] as any[][]);
vi.mock('firebase/firestore', async (orig) => {
  const real: any = await orig();
  return { ...real, setDoc: vi.fn(async (...a: any[]) => { cloudWrites.push(a); }) };
});
// Signed in, empty cloud registry; every other live listener is a no-op.
vi.mock('../../superadmin/src/cloud', async (orig) => {
  const real: any = await orig();
  const out: any = { ...real };
  for (const k of Object.keys(real)) if (k.startsWith('watch')) out[k] = () => () => {};
  out.watchAdmin = (cb: (u: any) => void) => { cb({ email: 'admin@digitaltarget.pk' }); return () => {}; };
  return out;
});
// Leaflet needs a real layout engine; the maps are not what is under test.
vi.mock('../../superadmin/src/DeviceMap', () => ({ default: () => null, escapeHtml: (s: string) => s }));
vi.mock('../../superadmin/src/LiveDeviceMap', () => ({ default: () => null }));

const strictDb = getFirestore(initializeApp({ apiKey: 'x', projectId: 'demo-strict-ui', appId: '1:1:web:1' }, 'strict-ui'));

describe('Super Admin → Register a device from an activation code', () => {
  beforeEach(() => { localStorage.clear(); cloudWrites.length = 0; });

  it('a shop that declined location: registered, and the cloud write is valid', async () => {
    const { key } = await mintLicenseKey({ plan: 'yearly', maxDevices: 2 });
    // Exactly what the POS shows after "Activation complete" — no lat/lng, no version.
    const code = await encodeReceipt({ key, device: 'HW-9F2A-77', business: 'Burewala Grill', owner: 'Ali', phone: '03001234567', plan: 'yearly', at: Date.now() });

    const { default: App } = await import('../../superadmin/src/App');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Device Map/ }));
    fireEvent.change(screen.getByPlaceholderText(/DTR1\./), { target: { value: code } });
    fireEvent.click(screen.getByRole('button', { name: 'Register device' }));

    expect(await screen.findByText(/Burewala Grill registered\. No location in this code/)).toBeInTheDocument();
    await waitFor(() => expect(cloudWrites.length).toBeGreaterThan(0));
    const [ref, data, opts] = cloudWrites[cloudWrites.length - 1];
    expect(ref.path).toBe(`clients/${key}`);
    expect(opts).toEqual({ merge: true });
    expect(data.devices).toEqual([expect.objectContaining({ id: 'HW-9F2A-77' })]);
    expect(Object.keys(data.devices[0]).sort()).toEqual(['activatedAt', 'id']);
    // The same data through Firestore's own (strict) validation: accepted.
    expect(() => writeBatch(strictDb).set(doc(strictDb, 'clients', key), data, { merge: true })).not.toThrow();
    expect(screen.queryByText(/Unsupported field value/)).toBeNull();
  });

  it('a shop that allowed location: the pin data is kept', async () => {
    const { key } = await mintLicenseKey({ plan: 'yearly', maxDevices: 2 });
    const code = await encodeReceipt({ key, device: 'HW-LOC-1', business: 'Lahore Tikka', owner: 'Sara', phone: '0321', plan: 'yearly', at: Date.now(), lat: 31.5204, lng: 74.3587, ver: '1.13.0' });
    const { default: App } = await import('../../superadmin/src/App');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Device Map/ }));
    fireEvent.change(screen.getByPlaceholderText(/DTR1\./), { target: { value: code } });
    fireEvent.click(screen.getByRole('button', { name: 'Register device' }));
    expect(await screen.findByText(/Lahore Tikka registered — device placed on the map/)).toBeInTheDocument();
    await waitFor(() => expect(cloudWrites.length).toBeGreaterThan(0));
    const data = cloudWrites[cloudWrites.length - 1][1];
    expect(data.devices[0]).toMatchObject({ id: 'HW-LOC-1', lat: 31.5204, lng: 74.3587, appVersion: '1.13.0' });
  });
});
