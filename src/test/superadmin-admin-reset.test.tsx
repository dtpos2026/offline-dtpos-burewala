// ============================================================
// SUPER ADMIN — Reset administrator password (per restaurant).
//
// Pinned:
//   • the dialog refuses a bad password, asks before sending, seals the
//     password for THAT licence and shows it once for the owner;
//   • it lists every computer under the licence with an honest state
//     (applied / waiting / needs update / failed);
//   • the offline reset code and "Cancel" are there;
//   • Clients → row menu has "Reset admin password…".
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openReset, sealReset } from '@/licensing/adminReset';
import { resetProgress, versionAtLeast, RESET_MIN_POS_VERSION, type DeviceDoc } from '../../superadmin/src/deviceState';

const KEY = 'DTPOS-ST-ABCD-EFGH-JKLM';
const NOW = 1_800_000_000_000;

const panel = vi.hoisted(() => ({
  pending: null as any,
  devices: [] as any[],
  sent: [] as { key: string; input: { username?: string; password: string } }[],
  cleared: [] as string[],
  listeners: new Set<(p: any) => void>(),
  fail: '' as string,
}));

vi.mock('../../superadmin/src/cloud', async (orig) => {
  const real: any = await orig();
  const { sealReset: seal } = await import('@/licensing/adminReset');
  return {
    ...real,
    watchAdminReset: (_key: string, cb: (p: any) => void) => { panel.listeners.add(cb); cb(panel.pending); return () => panel.listeners.delete(cb); },
    watchDevices: (cb: (l: any[]) => void) => { cb(panel.devices); return () => {}; },
    sendAdminReset: async (key: string, input: { username?: string; password: string }) => {
      if (panel.fail) throw Object.assign(new Error('denied'), { code: panel.fail });
      panel.sent.push({ key, input });
      const { token, command } = await seal(key, input);
      panel.pending = { id: command.id, token, username: command.username, issuedAt: command.issuedAt, expiresAt: command.expiresAt };
      panel.listeners.forEach(l => l(panel.pending));
      return panel.pending;
    },
    clearAdminReset: async (key: string) => { panel.cleared.push(key); panel.pending = null; panel.listeners.forEach(l => l(null)); },
  };
});

const client: any = { key: KEY, business: 'Burewala Grill', owner: 'Bilal', phone: '0300', plan: 'yearly', maxDevices: 2, expiryDate: null, issuedAt: 1, devices: [] };

async function open() {
  const { default: AdminReset } = await import('../../superadmin/src/AdminReset');
  const { FeedbackProvider } = await import('../../superadmin/src/ui');
  const onClose = vi.fn();
  render(<FeedbackProvider><AdminReset client={client} onClose={onClose} /></FeedbackProvider>);
  return onClose;
}
const typePassword = (v: string) => fireEvent.change(screen.getByLabelText('New password'), { target: { value: v } });
const sendBtn = () => screen.getByRole('button', { name: 'Send reset to this restaurant' });

beforeEach(() => {
  panel.pending = null; panel.devices = []; panel.sent = []; panel.cleared = []; panel.listeners.clear(); panel.fail = '';
});
afterEach(() => cleanup());

describe('the dialog', () => {
  it('cannot send until the password is acceptable', async () => {
    await open();
    expect(sendBtn()).toBeDisabled();
    typePassword('abc');
    expect(screen.getByRole('alert').textContent).toMatch(/at least 6/);
    expect(sendBtn()).toBeDisabled();
    typePassword('Good-Pass-1');
    expect(sendBtn()).toBeEnabled();
  });

  it('asks first, then seals the typed password for this licence and shows it once', async () => {
    await open();
    typePassword('Good-Pass-1');
    fireEvent.click(sendBtn());
    // The confirmation explains the effect; nothing is sent before it is accepted.
    expect(await screen.findByText(/old password stops working/)).toBeTruthy();
    expect(panel.sent).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Send reset' }));

    await waitFor(() => expect(panel.sent).toHaveLength(1));
    expect(panel.sent[0]).toEqual({ key: KEY, input: { username: '', password: 'Good-Pass-1' } });
    // The stored command opens for this licence only.
    await waitFor(() => expect(panel.pending).not.toBeNull());
    const opened = await openReset(panel.pending.token, KEY);
    expect(opened.ok && opened.command.password).toBe('Good-Pass-1');
    expect((await openReset(panel.pending.token, 'DTPOS-ST-OTHER-OTHER-OTHR')).ok).toBe(false);
    // Shown once for the owner, and the input is cleared.
    expect(await screen.findByText('Good-Pass-1')).toBeTruthy();
    expect((screen.getByLabelText('New password') as HTMLInputElement).value).toBe('');
  });

  it('can name a specific administrator', async () => {
    await open();
    fireEvent.change(screen.getByLabelText(/Administrator username/), { target: { value: 'owner' } });
    typePassword('Good-Pass-1');
    fireEvent.click(sendBtn());
    fireEvent.click(await screen.findByRole('button', { name: 'Send reset' }));
    await waitFor(() => expect(panel.sent[0]?.input.username).toBe('owner'));
  });

  it('explains what to do when the server refuses the write (rules not published)', async () => {
    panel.fail = 'permission-denied';
    await open();
    typePassword('Good-Pass-1');
    fireEvent.click(sendBtn());
    fireEvent.click(await screen.findByRole('button', { name: 'Send reset' }));
    expect((await screen.findByText(/Publish the latest superadmin\/firestore\.rules/)).textContent).toMatch(/adminResets/);
  });

  it('Generate makes a readable password', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Generate a password' }));
    const v = (screen.getByLabelText('New password') as HTMLInputElement).value;
    expect(v).toMatch(/^[abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/);
  });

  it('shows each computer under the licence with an honest state, and the offline code', async () => {
    const { token, command } = await sealReset(KEY, { password: 'Good-Pass-1' });
    panel.pending = { id: command.id, token, username: '', issuedAt: Date.now(), expiresAt: Date.now() + 86400_000 };
    panel.devices = [
      { deviceId: 'D1', licenseKey: KEY, hostname: 'COUNTER-1', appVersion: '1.21.0', lastSyncAt: Date.now(), adminResetId: command.id, adminResetResult: 'applied', adminResetAt: Date.now() },
      { deviceId: 'D2', licenseKey: KEY, hostname: 'KITCHEN-PC', appVersion: '1.21.0', lastSyncAt: Date.now() - 3 * 86400_000 },
      { deviceId: 'D3', licenseKey: KEY, hostname: 'OLD-PC', appVersion: '1.20.1', lastSyncAt: Date.now() },
      { deviceId: 'D4', licenseKey: 'DTPOS-ST-OTHER-OTHER-OTHR', hostname: 'SOMEONE-ELSE', appVersion: '1.21.0' },
    ];
    await open();
    const section = screen.getByRole('region', { name: 'Pending reset' });
    const text = section.textContent || '';
    expect(text).toMatch(/COUNTER-1.*Applied/);
    expect(text).toMatch(/KITCHEN-PC.*Waiting for this computer to go online/);
    expect(text).toMatch(/OLD-PC.*update it to v1\.21\.0/);
    expect(text).not.toMatch(/SOMEONE-ELSE/);
    expect(within(section).getByText(token)).toBeTruthy();   // the offline reset code
  });

  it('removes a pending reset after asking', async () => {
    const { token, command } = await sealReset(KEY, { password: 'Good-Pass-1' });
    panel.pending = { id: command.id, token, username: '', issuedAt: Date.now(), expiresAt: Date.now() + 86400_000 };
    await open();
    fireEvent.click(screen.getByRole('button', { name: /Cancel \/ remove the pending reset/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel reset' }));
    await waitFor(() => expect(panel.cleared).toEqual([KEY]));
  });

  it('labels an expired command as expired', async () => {
    const { token, command } = await sealReset(KEY, { password: 'Good-Pass-1' });
    panel.pending = { id: command.id, token, username: '', issuedAt: 1, expiresAt: 2 };
    await open();
    expect(screen.getByRole('region', { name: 'Pending reset' }).textContent).toMatch(/Last reset \(expired\)/);
  });
});

describe('the progress rules', () => {
  const dev = (o: Partial<DeviceDoc>): DeviceDoc => ({ deviceId: 'D', licenseKey: KEY, appVersion: '1.21.0', lastSyncAt: NOW, ...o });

  it('compares versions numerically', () => {
    expect(versionAtLeast('1.21.0', '1.21.0')).toBe(true);
    expect(versionAtLeast('1.9.9', '1.21.0')).toBe(false);
    expect(versionAtLeast('1.100.0', '1.21.0')).toBe(true);
    expect(versionAtLeast(undefined, '1.21.0')).toBe(false);
    expect(RESET_MIN_POS_VERSION).toBe('1.21.0');
  });

  it('a reset that names a wrong user is shown as failed, with the reason', () => {
    const [r] = resetProgress([dev({ adminResetId: 'x', adminResetResult: 'not-admin', adminResetAt: NOW })], KEY, 'x');
    expect(r.state).toBe('failed');
    expect(r.text).toMatch(/not an administrator/);
  });

  it('an older reset id does not count as applied for a newer reset', () => {
    const [r] = resetProgress([dev({ adminResetId: 'old', adminResetResult: 'applied' })], KEY, 'new');
    expect(r.state).toBe('waiting');
  });

  it('matches the licence key whatever its punctuation', () => {
    expect(resetProgress([dev({ licenseKey: KEY.toLowerCase().replace(/-/g, '') })], KEY, 'x')).toHaveLength(1);
  });
});

describe('the Clients screen', () => {
  it('has the menu entry and opens the dialog', () => {
    const app = readFileSync(resolve(__dirname, '../../superadmin/src/App.tsx'), 'utf8');
    expect(app).toMatch(/label: 'Reset admin password…', onSelect: \(\) => setResetting\(c\)/);
    expect(app).toMatch(/<AdminReset client=\{resetting\}/);
  });
});
