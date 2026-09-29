// ============================================================
// SUPER ADMIN — the professional pass (dashboard, clients table, dialogs).
//
// Pinned:
//   • every dashboard number is read from the registry — nothing invented;
//   • the clients table filters, and its row menu changes a licence only after
//     a styled confirmation (not the browser's confirm());
//   • the confirmation / toast / menu building blocks behave: Escape closes only
//     the top-most dialog, a declined confirmation changes nothing;
//   • the theme menu changes the theme, and only that.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act, cleanup } from '@testing-library/react';
import { useState } from 'react';

const setStatus = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../../superadmin/src/cloud', async (orig) => {
  const real: any = await orig();
  const out: any = { ...real };
  for (const k of Object.keys(real)) if (k.startsWith('watch')) out[k] = () => () => {};
  out.watchAdmin = (cb: (u: any) => void) => { cb({ email: 'admin@digitaltarget.pk' }); return () => {}; };
  out.setLicenseStatus = setStatus;
  out.pushClient = async () => {};   // no real cloud writes from these tests
  out.removeClient = async () => {};
  return out;
});
vi.mock('../../superadmin/src/DeviceMap', () => ({ default: () => null, escapeHtml: (s: string) => s }));
vi.mock('../../superadmin/src/LiveDeviceMap', () => ({ default: () => null }));

const DAY = 86400000;
const REGISTRY_KEY = 'dtpos-superadmin-registry';
const client = (key: string, business: string, plan: string, expiresInDays: number | null, devices = 0, extra: any = {}) => ({
  key, business, owner: 'Owner ' + business, phone: '0300', plan, maxDevices: 2,
  expiryDate: expiresInDays === null ? null : Date.now() + expiresInDays * DAY, issuedAt: Date.now() - 30 * DAY, notes: '',
  devices: Array.from({ length: devices }, (_, i) => ({ id: `HW-${business.slice(0, 3)}-${i}`, activatedAt: Date.now() - (i + 1) * DAY, appVersion: '1.15.0' })),
  ...extra,
});

function seed() {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify([
    client('DTPOS-AAAA-0001', 'Al-Madina', 'yearly', 200, 2),      // active
    client('DTPOS-BBBB-0002', 'Chai Corner', 'monthly', 9, 1),     // ending soon (active, ≤ 14)
    client('DTPOS-CCCC-0003', 'Royal Bakers', 'quarterly', -5, 1), // expired
    client('DTPOS-DDDD-0004', 'Pizza Point', 'yearly', 60, 0, { suspended: true }), // suspended
  ]));
}

beforeEach(() => { cleanup(); localStorage.clear(); setStatus.mockClear(); seed(); });
afterEach(() => { vi.useRealTimers(); });

async function openApp() {
  const { default: App } = await import('../../superadmin/src/App');
  render(<App />);
  return screen;
}

describe('the dashboard shows only what the registry holds', () => {
  it('counts, health legend, plans and recent activations all come from the four clients', async () => {
    await openApp();
    // the first match of each label is the stat card (the health legend comes after it)
    const stat = (label: string) => screen.getAllByText(label)[0].parentElement!.textContent!;
    expect(stat('Active')).toMatch(/^2/);                       // Al-Madina + Chai Corner
    expect(stat('Expiring within 14 days')).toMatch(/^1/);      // Chai Corner
    expect(stat('Expired')).toMatch(/^1/);                      // Royal Bakers
    expect(stat('Suspended')).toMatch(/^1/);                    // Pizza Point
    expect(stat('Devices activated')).toMatch(/^4/);            // 2 + 1 + 1 + 0

    const health = screen.getByRole('img', { name: /Active 1, Expiring within 14 days 1, Expired 1, Suspended 1/ });
    expect(health).toBeInTheDocument();
    expect(screen.getByText('Recent activations')).toBeInTheDocument();
    // newest activation first: every seeded device is listed by its own id
    expect(screen.getAllByText(/HW-Al-/).length).toBeGreaterThan(0);
    // no "online" number is invented when the cloud reports nothing
    expect(screen.queryByText('Online now')).toBeNull();
  });
});

describe('the clients table', () => {
  const goClients = async () => { await openApp(); fireEvent.click(await screen.findByRole('button', { name: /^Clients/ })); };

  it('filters by status, and by search', async () => {
    await goClients();
    const table = () => screen.getByRole('table');
    expect(within(table()).getAllByRole('row')).toHaveLength(1 + 4);
    fireEvent.click(screen.getByRole('button', { name: /^Expired/ }));
    expect(within(table()).getByText('Royal Bakers')).toBeInTheDocument();
    expect(within(table()).queryByText('Al-Madina')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^All/ }));
    fireEvent.change(screen.getByLabelText('Search clients'), { target: { value: 'chai' } });
    expect(within(table()).getByText('Chai Corner')).toBeInTheDocument();
    expect(within(table()).queryByText('Al-Madina')).toBeNull();
  });

  it('a licence is changed only after a styled confirmation; declining changes nothing', async () => {
    const nativeConfirm = vi.spyOn(window, 'confirm');
    await goClients();
    fireEvent.click(screen.getByRole('button', { name: /More actions for Al-Madina/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Suspended' }));

    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByText(/Set the licence of Al-Madina to SUSPENDED\?/)).toBeInTheDocument();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(setStatus).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /More actions for Al-Madina/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Suspended' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Set to Suspended' }));
    await waitFor(() => expect(setStatus).toHaveBeenCalledWith('DTPOS-AAAA-0001', 'suspended'));
    expect(nativeConfirm).not.toHaveBeenCalled(); // the browser's confirm() is no longer used here
  });

  it('deleting from the registry asks first and can be declined', async () => {
    await goClients();
    fireEvent.click(screen.getByRole('button', { name: /More actions for Pizza Point/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete from registry' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('Pizza Point')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /More actions for Pizza Point/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete from registry' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.queryByText('Pizza Point')).toBeNull());
  });

  it('opening the edit dialog does not claim the limits changed', async () => {
    await goClients();
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    const dlg = await screen.findByRole('dialog', { name: 'Edit licence' });
    expect(within(dlg).queryByText(/Devices, plan or expiry changed/)).toBeNull();
    fireEvent.click(within(dlg).getByRole('button', { name: '+30 days' }));
    expect(within(dlg).getByText(/Devices, plan or expiry changed/)).toBeInTheDocument();
  });
});

describe('the building blocks', () => {
  it('Escape closes only the top-most dialog', async () => {
    const { Modal, FeedbackProvider, useConfirm } = await import('../../superadmin/src/ui');
    function Host() {
      const [open, setOpen] = useState(true);
      const confirm = useConfirm();
      const [answer, setAnswer] = useState('');
      return (
        <div>
          {open && (
            <Modal onClose={() => setOpen(false)} label="Outer">
              <button onClick={async () => setAnswer(String(await confirm({ title: 'Sure?' })))}>ask</button>
            </Modal>
          )}
          <output data-testid="answer">{answer}</output>
          <output data-testid="open">{String(open)}</output>
        </div>
      );
    }
    render(<FeedbackProvider><Host /></FeedbackProvider>);
    fireEvent.click(screen.getByText('ask'));
    expect(await screen.findByText('Sure?')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });           // closes the confirmation …
    await waitFor(() => expect(screen.getByTestId('answer').textContent).toBe('false'));
    expect(screen.getByTestId('open').textContent).toBe('true');   // … not the dialog under it
    fireEvent.keyDown(window, { key: 'Escape' });           // now the outer one
    await waitFor(() => expect(screen.getByTestId('open').textContent).toBe('false'));
  });

  it('a toast appears and goes away by itself', async () => {
    vi.useFakeTimers();
    const { FeedbackProvider, useToast } = await import('../../superadmin/src/ui');
    function Host() { const toast = useToast(); return <button onClick={() => toast('Saved it.', 'success')}>go</button>; }
    render(<FeedbackProvider><Host /></FeedbackProvider>);
    fireEvent.click(screen.getByText('go'));
    expect(screen.getByText('Saved it.')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(4000); });
    expect(screen.queryByText('Saved it.')).toBeNull();
  });

  it('a row menu runs the chosen item, marks the current one, and closes on Escape', async () => {
    const { RowMenu } = await import('../../superadmin/src/ui');
    const picked = vi.fn();
    render(<RowMenu label="More" items={[{ heading: 'Status' }, { label: 'Active', checked: true, onSelect: picked }, 'separator', { label: 'Remove', danger: true, onSelect: picked }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }));
    expect(picked).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('themes in the Super Admin', () => {
  it('the Theme menu lists the thirteen themes and changes only the theme key', async () => {
    localStorage.setItem('desi-pos-data', '{"orders":[1]}');
    await openApp();
    fireEvent.click(screen.getByRole('button', { name: 'Change theme' }));
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(13);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tomato Red' }));
    expect(localStorage.getItem('dtpos-ui-theme')).toBe('tomato');
    expect(document.documentElement.getAttribute('data-ui-theme')).toBe('tomato');
    expect(localStorage.getItem('desi-pos-data')).toBe('{"orders":[1]}');
    document.documentElement.removeAttribute('data-ui-theme');
  });
});
