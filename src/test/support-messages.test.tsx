// ============================================================
// SUPPORT MESSAGES — a message reaches only the restaurant it is for.
//
// Reported: "a message sent from Super Admin to one restaurant shows in every
// restaurant's message box". Two causes, both pinned here:
//   • the POS asked for messages before it knew its own licence key, and with
//     no key its filter let every restaurant's messages through (and cached them);
//   • the Super Admin picker defaulted to "All / general note", so a message sent
//     without choosing a restaurant went to everyone.
//
// Now:
//   • the POS asks Firestore only for its own thread (clientKey = its licence key)
//     and Digital Target's announcements ('*'), and asks for nothing without a key;
//   • the cache is per licence key, and the old mixed cache is thrown away unread;
//   • a shop message always carries its own key; a shop can never post to everyone;
//   • the Super Admin must choose a restaurant, and "All restaurants" is a separate,
//     confirmed choice; the inbox says who each message went to or came from.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BROADCAST_KEY, isForShop } from '@/lib/messageRouting';
import { fetchMessages, sendShopMessage, cachedMessages, threadQuery } from '@/lib/cloudMessages';

const read = (p: string) => readFileSync(resolve(__dirname, '..', '..', p), 'utf8');

// ---------- a fake Firestore with three restaurants' messages ----------
type Fields = { clientKey?: string; from: 'admin' | 'shop'; text: string; createdAt: number };
const fsDoc = (id: string, f: Fields) => ({
  name: `projects/dtpos-offline/databases/(default)/documents/supportMessages/${id}`,
  fields: {
    ...(f.clientKey !== undefined ? { clientKey: { stringValue: f.clientKey } } : {}),
    from: { stringValue: f.from }, text: { stringValue: f.text }, createdAt: { integerValue: String(f.createdAt) },
  },
});
const DOCS = [
  fsDoc('a1', { clientKey: 'KEY-A', from: 'admin', text: 'A: your renewal is due', createdAt: 30 }),
  fsDoc('a2', { clientKey: 'KEY-A', from: 'shop', text: 'A: thank you', createdAt: 40 }),
  fsDoc('b1', { clientKey: 'KEY-B', from: 'admin', text: 'B only: payment received', createdAt: 20 }),
  fsDoc('b2', { clientKey: 'KEY-B', from: 'shop', text: 'B only: printer question', createdAt: 25 }),
  fsDoc('all', { clientKey: BROADCAST_KEY, from: 'admin', text: 'Everyone: support hours on Eid', createdAt: 10 }),
  fsDoc('old', { from: 'admin', text: 'Old keyless note meant for C', createdAt: 5 }),
  fsDoc('forged', { clientKey: BROADCAST_KEY, from: 'shop', text: 'A shop posting to everyone', createdAt: 50 }),
];

const calls: Array<{ url: string; method: string; body?: any }> = [];
function fakeFirestore(url: string, init?: any) {
  const method = init?.method || 'GET';
  const body = init?.body ? JSON.parse(init.body) : undefined;
  calls.push({ url: String(url), method, body });
  if (String(url).includes(':runQuery')) {
    const f = body.structuredQuery.where.fieldFilter;
    const wanted = f.value.arrayValue.values.map((v: any) => v.stringValue);
    // Like Firestore: a document without the field never matches an IN filter.
    const rows = DOCS.filter(d => d.fields.clientKey && wanted.includes(d.fields.clientKey.stringValue))
      .map(d => ({ document: d, readTime: '2026-10-07T00:00:00Z' }));
    return Promise.resolve(new Response(JSON.stringify(rows.length ? rows : [{ readTime: '2026-10-07T00:00:00Z' }]), { status: 200 }));
  }
  if (method === 'POST') return Promise.resolve(new Response('{}', { status: 200 }));
  // Listing the whole collection (what v1.19.0 and earlier did) returns every restaurant's messages.
  return Promise.resolve(new Response(JSON.stringify({ documents: DOCS }), { status: 200 }));
}

beforeEach(() => {
  calls.length = 0;
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(fakeFirestore));
});
afterEach(() => { vi.unstubAllGlobals(); cleanup(); });

describe('who a message is for', () => {
  it('its own restaurant, or everyone when Digital Target announces it', () => {
    expect(isForShop({ clientKey: 'KEY-A', from: 'admin' }, 'KEY-A')).toBe(true);
    expect(isForShop({ clientKey: 'KEY-A', from: 'shop' }, 'KEY-A')).toBe(true);
    expect(isForShop({ clientKey: 'KEY-B', from: 'admin' }, 'KEY-A')).toBe(false);
    expect(isForShop({ clientKey: BROADCAST_KEY, from: 'admin' }, 'KEY-A')).toBe(true);
    // a shop cannot speak to every restaurant, and an old keyless note goes to nobody
    expect(isForShop({ clientKey: BROADCAST_KEY, from: 'shop' }, 'KEY-A')).toBe(false);
    expect(isForShop({ from: 'admin' }, 'KEY-A')).toBe(false);
    expect(isForShop({ clientKey: '', from: 'admin' }, 'KEY-A')).toBe(false);
    // a restaurant that does not know its own key sees nothing at all
    expect(isForShop({ clientKey: 'KEY-A', from: 'admin' }, '')).toBe(false);
    expect(isForShop({ clientKey: BROADCAST_KEY, from: 'admin' }, undefined)).toBe(false);
  });
});

describe('what the POS downloads', () => {
  it('only its own thread and the announcements — one query, never the whole collection', async () => {
    const list = await fetchMessages({ licenseKey: 'KEY-A' });
    expect(list.map(m => m.text)).toEqual(['Everyone: support hours on Eid', 'A: your renewal is due', 'A: thank you']);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toMatch(/\/documents:runQuery\?key=/);
    expect(calls[0].body).toEqual(threadQuery('KEY-A'));
    expect(calls[0].body.structuredQuery.where.fieldFilter).toMatchObject({ field: { fieldPath: 'clientKey' }, op: 'IN' });
    expect(calls.some(c => c.method === 'GET' && /\/supportMessages\?/.test(c.url))).toBe(false);
  });

  it('restaurant B sees B’s messages, never A’s', async () => {
    const list = await fetchMessages({ licenseKey: 'KEY-B' });
    const text = list.map(m => m.text).join(' | ');
    expect(text).toMatch(/B only: payment received/);
    expect(text).toMatch(/Everyone: support hours on Eid/);
    expect(text).not.toMatch(/A: |keyless|posting to everyone/);
  });

  it('without its licence key it asks for nothing and shows nothing', async () => {
    expect(await fetchMessages({})).toEqual([]);
    expect(await fetchMessages({ licenseKey: '  ' })).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('keeps its cache per licence, and throws away the old cache that mixed restaurants', async () => {
    localStorage.setItem('dtpos-messages-cache', JSON.stringify([{ id: 'b1', from: 'admin', text: 'B only: payment received', createdAt: 20, clientKey: 'KEY-B' }]));
    expect(cachedMessages('KEY-A')).toEqual([]);
    expect(localStorage.getItem('dtpos-messages-cache')).toBeNull();
    await fetchMessages({ licenseKey: 'KEY-A' });
    expect(cachedMessages('KEY-A').map(m => m.id)).toEqual(['all', 'a1', 'a2']);
    expect(cachedMessages('KEY-B')).toEqual([]);
    expect(cachedMessages(undefined)).toEqual([]);
  });

  it('a shop note always carries its own key, and is not sent without one', async () => {
    expect(await sendShopMessage('Hello', {})).toBe(false);
    expect(calls).toHaveLength(0);
    expect(await sendShopMessage('Hello', { licenseKey: 'KEY-A', business: 'Restaurant A' })).toBe(true);
    const post = calls.find(c => c.method === 'POST')!;
    expect(post.url).toMatch(/\/supportMessages\?key=/);
    expect(post.body.fields.clientKey).toEqual({ stringValue: 'KEY-A' });
    expect(post.body.fields.from).toEqual({ stringValue: 'shop' });
  });
});

// ---------- the POS widget: nothing is asked for before the licence is known ----------
const licence = vi.hoisted(() => {
  let release: (v: any) => void = () => {};
  return {
    promise: null as Promise<any> | null,
    reset() { this.promise = new Promise(r => { release = r; }); },
    resolve(v: any) { release(v); },
  };
});
vi.mock('@/licensing/licenseService', () => ({ loadLicense: () => licence.promise }));

describe('the Messages button on the POS', () => {
  it('waits for this computer’s licence, then shows only its own messages', async () => {
    licence.reset();
    window.location.hash = '#/reports';
    // jsdom has no Element.scrollTo (every browser and Electron do); the widget scrolls to the newest message.
    if (!(Element.prototype as any).scrollTo) (Element.prototype as any).scrollTo = () => {};
    // A cache left behind by v1.19.0, holding another restaurant's message:
    localStorage.setItem('dtpos-messages-cache', JSON.stringify([{ id: 'b1', from: 'admin', text: 'B only: payment received', createdAt: 20 }]));
    const { default: DTMessagesWidget } = await import('@/components/DTMessagesWidget');
    render(<DTMessagesWidget />);
    await new Promise(r => setTimeout(r, 30));
    expect(calls).toHaveLength(0); // no licence yet → no request
    fireEvent.click(screen.getByRole('button', { name: 'Messages' }));
    expect(document.body.textContent).not.toMatch(/B only/);

    licence.resolve({ licenseKey: 'KEY-A', businessName: 'Restaurant A', mobileNumber: '0300' });
    await waitFor(() => expect(document.body.textContent).toMatch(/A: your renewal is due/));
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual(threadQuery('KEY-A'));
    const text = document.body.textContent || '';
    expect(text).toMatch(/Everyone: support hours on Eid/);
    expect(text).toMatch(/Digital Target · to all restaurants/);
    expect(text).not.toMatch(/B only|keyless|posting to everyone/);
  });
});

// ---------- the Super Admin Support tab ----------
const panel = vi.hoisted(() => ({ sent: [] as any[], inbox: [] as any[] }));
vi.mock('../../superadmin/src/cloud', async (orig) => {
  const real: any = await orig();
  return {
    ...real,
    watchMessages: (cb: (l: any[]) => void) => { cb(panel.inbox); return () => {}; },
    sendMessage: async (m: any) => { panel.sent.push(m); },
    markMessageRead: async () => {},
    deleteMessage: async () => {},
  };
});

const clients: any[] = [
  { key: 'KEY-A', business: 'Restaurant A', owner: 'A', phone: '0300-1111111', plan: 'yearly', maxDevices: 2, expiryDate: null, issuedAt: 1, devices: [] },
  { key: 'KEY-B', business: 'Restaurant B', owner: 'B', phone: '0300-2222222', plan: 'yearly', maxDevices: 2, expiryDate: null, issuedAt: 1, devices: [] },
];

async function openSupport() {
  const { default: Support } = await import('../../superadmin/src/Support');
  const { FeedbackProvider } = await import('../../superadmin/src/ui');
  render(<FeedbackProvider><Support clients={clients} /></FeedbackProvider>);
}
const typeMessage = (text: string) => fireEvent.change(screen.getByLabelText('Message'), { target: { value: text } });
const chooseTo = (value: string) => fireEvent.change(screen.getByLabelText('To'), { target: { value } });
const sendButton = () => screen.getByRole('button', { name: 'Send' });

describe('Super Admin → Support', () => {
  beforeEach(() => {
    panel.sent = [];
    panel.inbox = [
      { id: '1', clientKey: 'KEY-B', business: 'Restaurant B', from: 'shop', text: 'Printer is not working', createdAt: 4, read: false },
      { id: '2', clientKey: 'KEY-A', business: 'Restaurant A', from: 'admin', text: 'Renewal reminder', createdAt: 3, read: true },
      { id: '3', clientKey: BROADCAST_KEY, business: 'All restaurants', from: 'admin', text: 'Support hours on Eid', createdAt: 2, read: true },
      { id: '4', from: 'admin', text: 'Old general note', createdAt: 1, read: true },
    ];
  });

  it('nothing is sent until a restaurant is chosen — there is no "All" by default', async () => {
    await openSupport();
    typeMessage('Your renewal is due');
    expect((screen.getByLabelText('To') as HTMLSelectElement).value).toBe('');
    expect(sendButton()).toBeDisabled();
    expect(document.querySelector('[data-support-audience]')!.textContent).toMatch(/Choose a restaurant/);
    fireEvent.keyDown(screen.getByLabelText('Message'), { key: 'Enter' });
    await new Promise(r => setTimeout(r, 10));
    expect(panel.sent).toEqual([]);
  });

  it('a message to one restaurant carries only that restaurant’s key', async () => {
    await openSupport();
    chooseTo('KEY-A');
    typeMessage('Your renewal is due');
    expect(document.querySelector('[data-support-audience]')!.textContent).toBe('Only Restaurant A will see this message.');
    fireEvent.click(sendButton());
    await waitFor(() => expect(panel.sent).toHaveLength(1));
    expect(panel.sent[0]).toMatchObject({ clientKey: 'KEY-A', business: 'Restaurant A', text: 'Your renewal is due' });
  });

  it('"All restaurants" is a separate choice and asks first; declining sends nothing', async () => {
    await openSupport();
    chooseTo('__all__');
    typeMessage('Support hours on Eid');
    fireEvent.click(sendButton());
    expect(await screen.findByText('Send to every restaurant?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await new Promise(r => setTimeout(r, 10));
    expect(panel.sent).toEqual([]);

    fireEvent.click(sendButton());
    fireEvent.click(await screen.findByRole('button', { name: 'Send to all restaurants' }));
    await waitFor(() => expect(panel.sent).toHaveLength(1));
    expect(panel.sent[0]).toMatchObject({ clientKey: BROADCAST_KEY, text: 'Support hours on Eid' });
  });

  it('the inbox says who each message went to or came from, and Reply goes back to that restaurant', async () => {
    await openSupport();
    const addresses = Array.from(document.querySelectorAll('[data-support-address]')).map(e => e.textContent);
    expect(addresses).toEqual([
      'From Restaurant B', 'To Restaurant A', 'To all restaurants', 'Old general note — not shown on any POS',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    expect((screen.getByLabelText('To') as HTMLSelectElement).value).toBe('KEY-B');
    typeMessage('We will call you');
    fireEvent.click(sendButton());
    await waitFor(() => expect(panel.sent).toHaveLength(1));
    expect(panel.sent[0]).toMatchObject({ clientKey: 'KEY-B', business: 'Restaurant B' });
  });
});

describe('the database rule', () => {
  it('a shop note must carry its own licence key and can never be an announcement', () => {
    const rules = read('superadmin/firestore.rules');
    const block = rules.slice(rules.indexOf('match /supportMessages/'), rules.indexOf('match /health/'));
    expect(block).toMatch(/request\.resource\.data\.clientKey is string/);
    expect(block).toMatch(/request\.resource\.data\.clientKey\.size\(\) > 0/);
    expect(block).toMatch(/request\.resource\.data\.clientKey != '\*'/);
  });
});
