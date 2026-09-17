// ============================================================
// QC TESTS — v1.0.38 License multi-device slots
//
// Client request (screenshot): "super admin panel me license/device remove
// option ho, jitni devices allow karni hain utni ho jayen, aur purani device
// save rahe taake baar baar license na mange."
//
// Yahan asal slot logic test hoti hai — UI nahi, kyunki bug backend/logic
// me tha (single `deviceId` field + historical records ka block karna).
// ============================================================
import { describe, it, expect } from 'vitest';
import {
  readDevices,
  readMaxDevices,
  activeDevices,
  resolveDeviceSlot,
  devicesForWrite,
} from '@/licensing/deviceSlots';

const PC_OLD = 'HWID-OLD-PC-1111';
const PC_NEW = 'HWID-NEW-PC-2222';
const PC_THIRD = 'HWID-THIRD-3333';

describe('readDevices — purane licenses ka backward compat', () => {
  it('legacy sirf deviceId wale license ko migrate karta hai', () => {
    // Purana license: koi devices array nahi, sirf deviceId.
    const list = readDevices({ deviceId: PC_OLD, activatedAt: 1700000000000 });
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(PC_OLD);
    expect(list[0].status).toBe('active'); // pehle se activated customer na toote
  });

  it('deviceId khali ho to koi device nahi', () => {
    expect(readDevices({ deviceId: '' })).toHaveLength(0);
    expect(readDevices({})).toHaveLength(0);
  });

  it('legacy deviceId already array me ho to duplicate nahi banata', () => {
    const list = readDevices({
      deviceId: PC_OLD,
      devices: [{ id: PC_OLD, status: 'active' }],
    });
    expect(list).toHaveLength(1);
  });

  it('unlinked status parse hota hai', () => {
    const list = readDevices({ devices: [{ id: PC_OLD, status: 'unlinked' }] });
    expect(list[0].status).toBe('unlinked');
    expect(activeDevices(list)).toHaveLength(0);
  });
});

describe('readMaxDevices', () => {
  it('default 1 (purana behaviour)', () => {
    expect(readMaxDevices({})).toBe(1);
    expect(readMaxDevices({ maxDevices: 0 })).toBe(1);
    expect(readMaxDevices({ maxDevices: 'abc' })).toBe(1);
  });
  it('set ho to wohi', () => {
    expect(readMaxDevices({ maxDevices: 3 })).toBe(3);
  });
});

describe('resolveDeviceSlot — activation ka asal faisla', () => {
  it('naya license (koi device nahi) par pehli device chal jati hai', () => {
    const r = resolveDeviceSlot({ maxDevices: 1, devices: [] }, PC_NEW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(activeDevices(r.devices)).toHaveLength(1);
      expect(r.reused).toBe(false);
    }
  });

  it('wohi device dobara khule to naya slot nahi lagta (reuse)', () => {
    const lic = { maxDevices: 1, devices: [{ id: PC_OLD, status: 'active' }] };
    const r = resolveDeviceSlot(lic, PC_OLD);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.reused).toBe(true);
      expect(activeDevices(r.devices)).toHaveLength(1);
    }
  });

  it('1-device license par doosri machine block hoti hai', () => {
    const lic = { maxDevices: 1, devices: [{ id: PC_OLD, status: 'active' }] };
    const r = resolveDeviceSlot(lic, PC_NEW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/unlink|another computer/i);
  });

  it('CLIENT KA ASAL MASLA: unlink ke baad naya PC foran activate ho jata hai', () => {
    // Old PC unlink kar di gayi — record mojood hai lekin status unlinked.
    const lic = { maxDevices: 1, devices: [{ id: PC_OLD, status: 'unlinked' }] };
    const r = resolveDeviceSlot(lic, PC_NEW);
    expect(r.ok).toBe(true); // historical record block NAHI karta
    if (r.ok) {
      expect(activeDevices(r.devices)).toHaveLength(1);
      expect(activeDevices(r.devices)[0].id).toBe(PC_NEW);
      // purana record history ke liye mojood rehta hai
      expect(r.devices.find(d => d.id === PC_OLD)?.status).toBe('unlinked');
    }
  });

  it('CLIENT KA ASAL MASLA: purani device wapas aaye to usi record se active — license dobara nahi mangta', () => {
    const lic = { maxDevices: 1, devices: [{ id: PC_OLD, status: 'unlinked', firstActivatedAt: 1700000000000 }] };
    const r = resolveDeviceSlot(lic, PC_OLD);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.reused).toBe(true); // naya record nahi bana
      expect(r.devices).toHaveLength(1);
      expect(r.devices[0].status).toBe('active');
      expect(r.devices[0].firstActivatedAt).toBe(1700000000000); // history barqarar
    }
  });

  it('multi-device license: 3 allowed to 3 machines chalti hain', () => {
    let lic: any = { maxDevices: 3, devices: [] };
    for (const pc of [PC_OLD, PC_NEW, PC_THIRD]) {
      const r = resolveDeviceSlot(lic, pc);
      expect(r.ok).toBe(true);
      if (r.ok) lic = { ...lic, devices: devicesForWrite(r.devices) };
    }
    expect(activeDevices(readDevices(lic))).toHaveLength(3);
  });

  it('multi-device license: limit poori ho to chauthi machine block', () => {
    const lic = {
      maxDevices: 2,
      devices: [{ id: PC_OLD, status: 'active' }, { id: PC_NEW, status: 'active' }],
    };
    const r = resolveDeviceSlot(lic, PC_THIRD);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/2 devices|slots are in use/i);
  });

  it('legacy license (sirf deviceId) par usi PC ka activation chalta rehta hai', () => {
    // Pehle se activated customer — koi devices array nahi.
    const r = resolveDeviceSlot({ deviceId: PC_OLD }, PC_OLD);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.reused).toBe(true);
  });

  it('legacy license par doosra PC tab bhi block (maxDevices default 1)', () => {
    const r = resolveDeviceSlot({ deviceId: PC_OLD }, PC_NEW);
    expect(r.ok).toBe(false);
  });
});

describe('devicesForWrite — cloud safety', () => {
  it('undefined values nahi bhejta (cloud reject karta hai)', () => {
    const out = devicesForWrite([{ id: PC_OLD, status: 'active' }]);
    for (const v of Object.values(out[0])) {
      expect(v).not.toBeUndefined();
    }
  });

  it('round-trip: write ke baad wapas parse ho jata hai', () => {
    const r = resolveDeviceSlot({ maxDevices: 2, devices: [] }, PC_NEW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const back = readDevices({ devices: devicesForWrite(r.devices) });
      expect(back).toHaveLength(1);
      expect(back[0].id).toBe(PC_NEW);
      expect(back[0].status).toBe('active');
    }
  });
});
