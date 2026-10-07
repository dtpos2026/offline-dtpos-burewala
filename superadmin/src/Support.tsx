// Support tab — notes/messages between Digital Target and each shop,
// stored in Firestore so any staff machine sees the same thread.
//
// Every message is addressed: to one restaurant (its licence key, and only
// that restaurant's POS shows it), or — chosen on purpose and confirmed — to
// all restaurants as an announcement. Nothing is sent to "everyone" by default.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  watchMessages, sendMessage, markMessageRead, deleteMessage, type SupportMessage,
} from './cloud';
import type { Client } from './registry';
import { BROADCAST_KEY } from '@pos/lib/messageRouting';
import { ACCENT, MUTED, LINE, STATUS, card, input, label, primaryBtn, ghostBtn } from './theme';
import { Empty, useConfirm } from './ui';
import { MessageSquare } from 'lucide-react';

/** The recipient picker's value for "All restaurants". */
const ALL = '__all__';

/** Who a message went to, or came from — in the words the inbox shows. */
function addressOf(m: Pick<SupportMessage, 'from' | 'clientKey' | 'business'>, names: Map<string, string>): string {
  const shop = (key?: string) => (key && names.get(key)) || m.business || '';
  if (m.from === 'shop') return `From ${shop(m.clientKey) || 'a restaurant without a licence key'}`;
  if (m.clientKey === BROADCAST_KEY) return 'To all restaurants';
  if (m.clientKey) return `To ${shop(m.clientKey) || m.clientKey}`;
  return 'Old general note — not shown on any POS';
}

export default function Support({ clients }: { clients: Client[] }) {
  const confirm = useConfirm();
  const [msgs, setMsgs] = useState<SupportMessage[]>([]);
  const [err, setErr] = useState<string | null>(null);
  // '' = nobody chosen yet; a licence key = one restaurant; ALL = an announcement to everyone.
  const [to, setTo] = useState('');
  const [replyName, setReplyName] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const textRef = useRef<HTMLInputElement>(null);

  useEffect(() => watchMessages(setMsgs, e => setErr(e.message)), []);

  const names = useMemo(() => new Map(clients.map(c => [c.key, c.business || c.owner || c.key.slice(0, 10)])), [clients]);
  const shopName = (key?: string, fallback?: string) => (key && names.get(key)) || fallback || '';

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return msgs.filter(m => !q
      || addressOf(m, names).toLowerCase().includes(q)
      || (m.business || '').toLowerCase().includes(q)
      || (m.text || '').toLowerCase().includes(q));
  }, [msgs, filter, names]);

  const chosenName = to === ALL ? '' : shopName(to, replyName);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    if (!to) { setErr('Choose the restaurant this message is for.'); return; }
    if (to === ALL && !(await confirm({
      title: 'Send to every restaurant?',
      body: `This message will appear in the message box of all ${clients.length} restaurant${clients.length === 1 ? '' : 's'}. To reach one restaurant, choose it instead.`,
      confirmLabel: 'Send to all restaurants',
    }))) return;
    setBusy(true); setErr(null);
    try {
      if (to === ALL) {
        await sendMessage({ clientKey: BROADCAST_KEY, business: 'All restaurants', text: body });
      } else {
        const c = clients.find(x => x.key === to);
        await sendMessage({ clientKey: to, business: c?.business || replyName || undefined, phone: c?.phone, text: body });
      }
      setText('');
    } catch (e: any) { setErr(e?.message || 'Could not send'); }
    finally { setBusy(false); }
  };

  const reply = (m: SupportMessage) => {
    if (!m.clientKey) return;
    setTo(m.clientKey);
    setReplyName(shopName(m.clientKey, m.business));
    setErr(null);
    textRef.current?.focus();
  };

  // A reply can go to a restaurant that is not in this computer's registry yet.
  const extraOption = to && to !== ALL && !names.has(to) ? to : '';

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section style={{ ...card, padding: 18 }}>
        <h2 style={{ fontSize: 'var(--ui-text-card-title)', fontWeight: 700, margin: '0 0 12px' }}>Send a message</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 220px', maxWidth: 300 }}>
            <label style={label} htmlFor="support-to">To</label>
            <select
              id="support-to"
              data-support-to
              style={input as React.CSSProperties}
              value={to}
              onChange={e => { setTo(e.target.value); setReplyName(''); setErr(null); }}
            >
              <option value="" disabled>Choose a restaurant…</option>
              {clients.map(c => <option key={c.key} value={c.key}>{c.business || c.owner || c.key.slice(0, 10)}</option>)}
              {extraOption && <option value={extraOption}>{replyName || extraOption}</option>}
              <option value={ALL}>All restaurants (announcement)</option>
            </select>
          </div>
          <div style={{ flex: '3 1 260px' }}>
            <label style={label} htmlFor="support-text">Message</label>
            <input
              id="support-text"
              ref={textRef}
              style={input}
              value={text}
              placeholder="Renewal reminder, support note…"
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send(); }}
            />
          </div>
          <button style={primaryBtn} disabled={busy || !text.trim() || !to} onClick={send}>
            {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
        <div data-support-audience style={{ marginTop: 8, fontSize: 12, color: to === ALL ? STATUS.suspended.fg : MUTED }}>
          {!to && 'Choose a restaurant: only that restaurant will see the message.'}
          {to === ALL && 'Every restaurant will see this message. You will be asked to confirm.'}
          {to && to !== ALL && `Only ${chosenName || 'this restaurant'} will see this message.`}
        </div>
        {err && <div role="alert" style={{ marginTop: 10, fontSize: 12.5, color: STATUS.expired.fg }}>{err}</div>}
      </section>

      <section style={{ ...card, padding: 18 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 'var(--ui-text-card-title)', fontWeight: 700, margin: 0 }}>Inbox</h2>
          <span style={{ fontSize: 11.5, color: MUTED }}>{msgs.length} message(s)</span>
          <input style={{ ...input, marginLeft: 'auto', maxWidth: 240 }} placeholder="Search…"
                 value={filter} onChange={e => setFilter(e.target.value)} />
        </div>

        {shown.length === 0 && <Empty icon={MessageSquare}>No messages yet.</Empty>}

        <div style={{ display: 'grid', gap: 8 }}>
          {shown.map(m => (
            <div key={m.id} data-support-row style={{
              border: `1px solid ${LINE}`, borderRadius: 'var(--ui-radius-control)', padding: '12px 14px',
              display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap',
              background: m.read ? 'transparent' : 'var(--ui-accent-soft)',
            }}>
              <span style={{
                fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, marginTop: 2,
                background: m.from === 'admin' ? ACCENT : STATUS.active.fg, color: m.from === 'admin' ? 'var(--ui-accent-fg)' : '#fff',
              }}>{m.from === 'admin' ? 'DT' : 'SHOP'}</span>
              <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                <div data-support-address style={{ fontSize: 13.5, fontWeight: 600, color: !m.clientKey && m.from === 'admin' ? MUTED : undefined }}>
                  {addressOf(m, names)}
                </div>
                <div style={{ fontSize: 12.5, color: MUTED, whiteSpace: 'pre-wrap' }}>{m.text}</div>
                <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>
                  {new Date(m.createdAt).toLocaleString()}
                </div>
              </div>
              {m.from === 'shop' && m.clientKey && <button style={ghostBtn} onClick={() => reply(m)}>Reply</button>}
              {!m.read && <button style={ghostBtn} onClick={() => markMessageRead(m.id)}>Mark read</button>}
              <button
                style={{ ...ghostBtn, color: STATUS.expired.fg, borderColor: STATUS.expired.bd }}
                onClick={async () => {
                  if (await confirm({ title: 'Delete this message?', confirmLabel: 'Delete', danger: true })) deleteMessage(m.id);
                }}
              >Delete</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
