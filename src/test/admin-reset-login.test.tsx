// ============================================================
// FORGOT PASSWORD on the sign-in screen — the shop's side of an admin
// password reset.
//
// Pinned:
//   • every look of the sign-in page has "Forgot password?";
//   • "Check for a reset now" applies a command Super Admin left for this
//     licence and says so in plain English;
//   • a pasted reset code works with no internet, and a wrong one is
//     explained, not applied;
//   • while the screen is open it picks a command up by itself and tells
//     the person to use the new password.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { sealReset } from '@/licensing/adminReset';

const KEY = 'DTPOS-ST-ABCD-EFGH-JKLM';
const STORE_KEY = 'desi-pos-data';
const idOf = (k: string) => k.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 200);
const docs = new Map<string, string>();

function seed() {
  localStorage.setItem(STORE_KEY, JSON.stringify({
    orders: [], menuItems: [], inventory: [], stockLogs: [], customers: [], recipes: [], tables: [], categories: [], paymentAccounts: [],
    users: [{ id: 'admin-default', name: 'Administrator', username: 'admin', password: 'forgotten', role: 'admin', isActive: true }],
    settings: { name: 'Sample Restaurant' }, orderCounter: 0,
  }));
}
const putCommand = async (password: string) => {
  const { token } = await sealReset(KEY, { password });
  docs.set(`adminResets/${idOf(KEY)}`, token);
  return token;
};

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

beforeEach(() => {
  localStorage.clear();
  docs.clear();
  vi.resetModules();
  cleanup();
  vi.doMock('@/licensing/licenseService', () => ({ loadLicense: async () => ({ licenseKey: KEY, deviceId: 'DEV-1', ownerName: 'Bilal' }) }));
  vi.stubGlobal('fetch', async (input: string) => {
    const path = decodeURIComponent(new URL(input).pathname.split('/documents/')[1] || '');
    const token = docs.get(path);
    return token
      ? { ok: true, status: 200, json: async () => ({ fields: { token: { stringValue: token } } }) } as Response
      : { ok: false, status: 404, json: async () => ({}) } as Response;
  });
  seed();
});
afterEach(() => cleanup());

async function openLogin() {
  const { default: LoginPage } = await import('@/pages/LoginPage');
  render(<MemoryRouter><LoginPage onLogin={vi.fn()} /></MemoryRouter>);
}
const forgot = () => document.querySelector('[data-forgot-password]') as HTMLButtonElement;

describe('Forgot password?', () => {
  it('is on the sign-in page, and opens the help dialog', async () => {
    await openLogin();
    expect(forgot().textContent).toMatch(/Forgot password\?/);
    fireEvent.click(forgot());
    expect(await screen.findByText(/Forgot the administrator password\?/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Check for a reset now/ })).toBeTruthy();
    expect(screen.getByLabelText('Reset code')).toBeTruthy();
  });

  it('"Check for a reset now" applies a command that arrived after the screen opened', async () => {
    await openLogin();                        // the screen looked once on opening: nothing there yet
    await putCommand('Cloud-Pass-1');         // Digital Target sends the reset
    fireEvent.click(forgot());
    fireEvent.click(await screen.findByRole('button', { name: /Check for a reset now/ }));
    expect((await screen.findByRole('status')).textContent).toMatch(/administrator password was reset.*"admin"/);
    const { authenticateUser } = await import('@/lib/store');
    expect(authenticateUser('admin', 'Cloud-Pass-1').reason).toBe('ok');
    expect(authenticateUser('admin', 'forgotten').reason).toBe('bad_password');
    // The sign-in form is ready for the new password: username filled in.
    expect((screen.getByPlaceholderText('Enter your username') as HTMLInputElement).value).toBe('admin');
  });

  it('says plainly when nothing is waiting', async () => {
    await openLogin();
    fireEvent.click(forgot());
    fireEvent.click(await screen.findByRole('button', { name: /Check for a reset now/ }));
    expect((await screen.findByRole('status')).textContent).toMatch(/No password reset is waiting/);
  });

  it('applies a pasted reset code with no internet', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
    await openLogin();
    fireEvent.click(forgot());
    const { token } = await sealReset(KEY, { password: 'Pasted-Pass-1' });
    fireEvent.change(await screen.findByLabelText('Reset code'), { target: { value: token } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply reset code' }));
    expect((await screen.findByRole('status')).textContent).toMatch(/administrator password was reset.*"admin"/);
    const { authenticateUser } = await import('@/lib/store');
    expect(authenticateUser('admin', 'Pasted-Pass-1').reason).toBe('ok');
  });

  it('explains a code that does not belong to this restaurant and changes nothing', async () => {
    await openLogin();
    fireEvent.click(forgot());
    const { token } = await sealReset('DTPOS-ST-ZZZZ-YYYY-XXXX', { password: 'Not-Yours-1' });
    fireEvent.change(await screen.findByLabelText('Reset code'), { target: { value: token } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply reset code' }));
    expect((await screen.findByRole('status')).textContent).toMatch(/not valid for this restaurant/);
    const { authenticateUser } = await import('@/lib/store');
    expect(authenticateUser('admin', 'forgotten').reason).toBe('ok');
  });

  it('announces a reset it picked up by itself', async () => {
    await putCommand('Cloud-Pass-2');
    const { toast } = await import('sonner');
    await openLogin();
    await waitFor(() => expect((toast.success as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.stringMatching(/administrator password was reset by Digital Target/), expect.anything()));
  });
});
