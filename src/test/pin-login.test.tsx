// ============================================================
// PIN SIGN-IN — tap your name, type a 4-digit PIN; the password still works.
//
// Pinned:
//   • a PIN is optional, exactly 4 digits, set in Users & Roles (no default PINs);
//   • the cards list active staff (not riders); a user without a PIN goes to the
//     password form with the username filled in;
//   • the 4th digit signs in; a wrong PIN says how many tries are left; five
//     wrong PINs lock that user's PIN sign-in for a minute (not the password);
//   • Espresso Orange opens on the PIN page, with the first-login hint only while
//     the admin still has the factory password; other looks offer "Sign in with
//     PIN" once someone has a PIN;
//   • a PIN sign-in goes through the same steps as a password one.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const STORE_KEY = 'desi-pos-data';
const USERS = [
  { id: 'admin-default', name: 'Administrator', username: 'admin', password: 'admin123', role: 'admin', isActive: true, pin: '1234' },
  { id: 'u-cashier', name: 'Cashier', username: 'cashier', password: 'c-pass', role: 'cashier', isActive: true },
  { id: 'u-old', name: 'Old Staff', username: 'old', password: 'x', role: 'cashier', isActive: false, pin: '9999' },
  { id: 'u-rider', name: 'Rider', username: '03001234567', password: '5555', role: 'rider', isActive: true, pin: '5555' },
];
type SeedUser = Record<string, unknown>;
function seed(users: SeedUser[] = USERS) {
  localStorage.setItem(STORE_KEY, JSON.stringify({
    orders: [], menuItems: [], inventory: [], stockLogs: [], customers: [], recipes: [], tables: [], users, categories: [],
    paymentAccounts: [], settings: { name: 'Sample Restaurant' }, orderCounter: 0,
  }));
}

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
  cleanup();
  document.documentElement.removeAttribute('data-ui');
  document.documentElement.removeAttribute('data-look');
  document.documentElement.removeAttribute('data-ui-theme');
});
afterEach(() => cleanup());

describe('the store', () => {
  it('a PIN is exactly four digits', async () => {
    const { isValidLoginPin } = await import('@/lib/store');
    expect(isValidLoginPin('1234')).toBe(true);
    for (const bad of ['123', '12345', '12a4', '', undefined, 1234]) expect(isValidLoginPin(bad)).toBe(false);
  });

  it('the cards: active staff, no riders, with who has a PIN', async () => {
    seed();
    const { pinLoginUsers } = await import('@/lib/store');
    expect(pinLoginUsers()).toEqual([
      { id: 'admin-default', name: 'Administrator', username: 'admin', role: 'admin', hasPin: true },
      { id: 'u-cashier', name: 'Cashier', username: 'cashier', role: 'cashier', hasPin: false },
    ]);
  });

  it('right PIN, wrong PIN, no PIN, inactive, unknown', async () => {
    seed();
    const { authenticateUserByPin } = await import('@/lib/store');
    expect(authenticateUserByPin('admin-default', '1234')).toMatchObject({ reason: 'ok', user: { id: 'admin-default' } });
    expect(authenticateUserByPin('admin-default', '0000')).toEqual({ user: null, reason: 'bad_pin', triesLeft: 4 });
    expect(authenticateUserByPin('u-cashier', '1234').reason).toBe('no_pin');
    expect(authenticateUserByPin('u-old', '9999').reason).toBe('inactive');
    expect(authenticateUserByPin('nobody', '1234').reason).toBe('not_found');
  });

  it('five wrong PINs lock the PIN for a minute; the password still works; it unlocks after', async () => {
    seed();
    const { authenticateUserByPin, authenticateUser, PIN_LOCK_MS } = await import('@/lib/store');
    const t0 = 1_000_000;
    for (let i = 1; i <= 4; i++) expect(authenticateUserByPin('admin-default', '0000', t0).triesLeft).toBe(5 - i);
    expect(authenticateUserByPin('admin-default', '0000', t0)).toEqual({ user: null, reason: 'locked', retryInSec: 60 });
    // even the right PIN waits while locked
    expect(authenticateUserByPin('admin-default', '1234', t0 + 30_000)).toEqual({ user: null, reason: 'locked', retryInSec: 30 });
    expect(authenticateUser('admin', 'admin123').reason).toBe('ok');
    // after the minute: a fresh count, and the right PIN works and clears it
    expect(authenticateUserByPin('admin-default', '0000', t0 + PIN_LOCK_MS + 1)).toMatchObject({ reason: 'bad_pin', triesLeft: 4 });
    expect(authenticateUserByPin('admin-default', '1234', t0 + PIN_LOCK_MS + 2).reason).toBe('ok');
    expect(JSON.parse(localStorage.getItem('dtpos-pin-lock') || '{}')['admin-default']).toBeUndefined();
  });

  it('the factory admin password is noticed until it is changed', async () => {
    seed();
    const store = await import('@/lib/store');
    expect(store.adminUsesDefaultPassword()).toBe(true);
    store.saveUser({ ...USERS[0], password: 'n3w-Secret' } as Parameters<typeof store.saveUser>[0]);
    expect(store.adminUsesDefaultPassword()).toBe(false);
  });

  it('no user gets a PIN by itself', () => {
    const store = read('lib/store.ts');
    expect(store).not.toMatch(/pin:\s*'1234'/);
  });
});

describe('the PIN panel', () => {
  const setup = async () => {
    seed();
    const { default: PinLoginPanel } = await import('@/components/PinLoginPanel');
    const onSuccess = vi.fn(); const onUsePassword = vi.fn();
    render(<PinLoginPanel heading onSuccess={onSuccess} onUsePassword={onUsePassword} />);
    return { onSuccess, onUsePassword };
  };
  const tap = (k: string) => fireEvent.click(document.querySelector(`[data-pin-key="${k}"]`)!);

  it('cards first; the keypad appears for the chosen user; the 4th digit signs in', async () => {
    const { onSuccess } = await setup();
    expect(screen.getByText('Select your name and enter your PIN.')).toBeTruthy();
    expect(screen.getAllByRole('radio').map(r => r.getAttribute('data-pin-user'))).toEqual(['admin-default', 'u-cashier']);
    expect(document.querySelector('[data-pin-key]')).toBeNull();
    fireEvent.click(document.querySelector('[data-pin-user="admin-default"]')!);
    expect(screen.getByRole('radio', { name: /Administrator/ })).toHaveAttribute('aria-checked', 'true');
    ['1', '2', '3'].forEach(tap);
    expect(document.querySelector('[data-pin-dots]')!.getAttribute('data-pin-dots')).toBe('3');
    expect(onSuccess).not.toHaveBeenCalled();
    tap('4');
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess.mock.calls[0][0]).toMatchObject({ id: 'admin-default', role: 'admin' });
    expect(localStorage.getItem('pos-pin-last-user')).toBe('admin-default');
  });

  it('a wrong PIN clears the dots and says how many tries are left; C and ⌫ work', async () => {
    const { onSuccess } = await setup();
    fireEvent.click(document.querySelector('[data-pin-user="admin-default"]')!);
    tap('9'); tap('⌫'); expect(document.querySelector('[data-pin-dots]')!.getAttribute('data-pin-dots')).toBe('0');
    tap('5'); tap('C'); expect(document.querySelector('[data-pin-dots]')!.getAttribute('data-pin-dots')).toBe('0');
    ['0', '0', '0', '0'].forEach(tap);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('Wrong PIN — 4 tries left');
    expect(document.querySelector('[data-pin-dots]')!.getAttribute('data-pin-dots')).toBe('0');
  });

  it('the keyboard types the PIN, but not while a text box has focus', async () => {
    const { onSuccess } = await setup();
    fireEvent.click(document.querySelector('[data-pin-user="admin-default"]')!);
    const box = document.createElement('input');
    document.body.appendChild(box);
    fireEvent.keyDown(box, { key: '1' });
    expect(document.querySelector('[data-pin-dots]')!.getAttribute('data-pin-dots')).toBe('0');
    box.remove();
    for (const k of ['1', '2', '3', '4']) fireEvent.keyDown(document.body, { key: k });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('a user without a PIN goes to the password form, username filled in', async () => {
    const { onUsePassword } = await setup();
    expect(screen.getByRole('radio', { name: /Cashier/ }).textContent).toMatch(/Cashier · password/);
    fireEvent.click(document.querySelector('[data-pin-user="u-cashier"]')!);
    expect(onUsePassword).toHaveBeenCalledWith('cashier');
    fireEvent.click(screen.getByRole('button', { name: /Use username & password/ }));
    expect(onUsePassword).toHaveBeenCalledTimes(2);
  });
});

describe('the sign-in page', () => {
  const open = async (theme: string | null, users: SeedUser[] = USERS) => {
    seed(users);
    if (theme) { const ui = await import('@/lib/uiStyle'); ui.setTheme(theme); }
    const { default: LoginPage } = await import('@/pages/LoginPage');
    const onLogin = vi.fn();
    render(<MemoryRouter><LoginPage onLogin={onLogin} /></MemoryRouter>);
    return onLogin;
  };

  it('Espresso Orange opens on the PIN page, with the first-login hint and a way to the password', async () => {
    const onLogin = await open('dtr-espresso');
    expect(document.querySelector('[data-login-look="espresso"]')).toBeTruthy();
    expect(document.querySelector('[data-login-pin-page]')).toBeTruthy();
    expect(document.querySelector('[data-first-login]')!.textContent).toMatch(/username admin, password admin123/);
    expect(document.querySelector('[data-dtr="login-brand"][data-variant="espresso"]')!.textContent).toMatch(/Welcome toSample Restaurant/);
    fireEvent.click(document.querySelector('[data-pin-user="admin-default"]')!);
    for (const k of ['1', '2', '3', '4']) fireEvent.click(document.querySelector(`[data-pin-key="${k}"]`)!);
    expect(onLogin).toHaveBeenCalledWith('admin-default', 'admin');
    expect(localStorage.getItem('pos-login-mode')).toBe('pin');
    expect(JSON.parse(localStorage.getItem('dt_pos_current_user')!)).toMatchObject({ id: 'admin-default', role: 'admin' });
  });

  it('"Use username & password" shows the form; "Sign in with PIN" comes back', async () => {
    await open('dtr-espresso');
    fireEvent.click(screen.getByRole('button', { name: /Use username & password/ }));
    expect(screen.getByPlaceholderText('Enter your username')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Sign in with PIN/ }));
    expect(document.querySelector('[data-login-pin-page]')).toBeTruthy();
  });

  it('the hint goes once the admin password is changed', async () => {
    await open('dtr-espresso', [{ ...USERS[0], password: 'S3cret!' }, USERS[1]]);
    expect(document.querySelector('[data-first-login]')).toBeNull();
  });

  it('other looks keep the password form, and offer "Sign in with PIN" only once someone has a PIN', async () => {
    await open('dtr-sunset', USERS.map(u => ({ ...u, pin: undefined })));
    expect(screen.getByPlaceholderText('Enter your username')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Sign in with PIN/ })).toBeNull();
    expect(document.querySelector('[data-first-login]')).toBeNull();
    cleanup(); vi.resetModules(); localStorage.clear();

    const onLogin = await open('dtr-sunset');
    fireEvent.click(screen.getByRole('button', { name: /Sign in with PIN/ }));
    fireEvent.click(document.querySelector('[data-pin-user="admin-default"]')!);
    for (const k of ['1', '2', '3', '4']) fireEvent.click(document.querySelector(`[data-pin-key="${k}"]`)!);
    expect(onLogin).toHaveBeenCalledWith('admin-default', 'admin');
  });

  it('the password still signs in, and is remembered as the way in', async () => {
    const onLogin = await open(null);
    fireEvent.change(screen.getByPlaceholderText('Enter your username'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'admin123' } });
    fireEvent.click(screen.getByRole('button', { name: /^Sign In$/ }));
    expect(onLogin).toHaveBeenCalledWith('admin-default', 'admin');
    expect(localStorage.getItem('pos-login-mode')).toBe('password');
  });
});

describe('Users & Roles', () => {
  const page = read('pages/UsersRolesPage.tsx');
  it('an optional 4-digit PIN for everyone but riders and order takers', () => {
    expect(page).toMatch(/if \(pin && pin\.length !== 4\) \{ toast\.error\('The quick login PIN must be exactly 4 digits \(or leave it empty\)'\); return; \}/);
    expect(page).toMatch(/toSave = \{ \.\.\.toSave, pin: pin \|\| undefined \};/);
    expect(page).toMatch(/Quick login PIN \(optional\)/);
    expect(page).toMatch(/data-user-has-pin/);
  });
});
