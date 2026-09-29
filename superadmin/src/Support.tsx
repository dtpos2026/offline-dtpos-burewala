// Support tab — notes/messages between Digital Target and each shop,
// stored in Firestore so any staff machine sees the same thread.
import { useEffect, useMemo, useState } from 'react';
import {
  watchMessages, sendMessage, markMessageRead, deleteMessage, type SupportMessage,
} from './cloud';
import type { Client } from './registry';
import { ACCENT, MUTED, LINE, STATUS, TINT, card, input, label, primaryBtn, ghostBtn } from './theme';
import { Empty, useConfirm } from './ui';
import { MessageSquare } from 'lucide-react';

export default function Support({ clients }: { clients: Client[] }) {
  const confirm = useConfirm();
  const [msgs, setMsgs] = useState<SupportMessage[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [clientKey, setClientKey] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => watchMessages(setMsgs, e => setErr(e.message)), []);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return msgs.filter(m => !q
      || (m.business || '').toLowerCase().includes(q)
      || (m.text || '').toLowerCase().includes(q));
  }, [msgs, filter]);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true); setErr(null);
    try {
      const c = clients.find(x => x.key === clientKey);
      await sendMessage({ clientKey: clientKey || undefined, business: c?.business, phone: c?.phone, text: text.trim() });
      setText('');
    } catch (e: any) { setErr(e?.message || 'Could not send'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section style={{ ...card, padding: 18 }}>
        <h2 style={{ fontSize: 'var(--ui-text-card-title)', fontWeight: 700, margin: '0 0 12px' }}>Send a message</h2>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '260px 1fr auto', alignItems: 'end' }}>
          <div>
            <label style={label}>Client</label>
            <select style={input as React.CSSProperties} value={clientKey} onChange={e => setClientKey(e.target.value)}>
              <option value="">All / general note</option>
              {clients.map(c => <option key={c.key} value={c.key}>{c.business || c.owner || c.key.slice(0, 10)}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Message</label>
            <input style={input} value={text} placeholder="Renewal reminder, support note…"
                   onChange={e => setText(e.target.value)}
                   onKeyDown={e => { if (e.key === 'Enter') send(); }} />
          </div>
          <button style={primaryBtn} disabled={busy || !text.trim()} onClick={send}>
            {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
        {err && <div role="alert" style={{ marginTop: 10, fontSize: 12.5, color: STATUS.expired.fg }}>{err}</div>}
      </section>

      <section style={{ ...card, padding: 18 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 'var(--ui-text-card-title)', fontWeight: 700, margin: 0 }}>Inbox</h2>
          <span style={{ fontSize: 11.5, color: MUTED }}>{msgs.length} message(s)</span>
          <input style={{ ...input, marginLeft: 'auto', maxWidth: 240 }} placeholder="Search…"
                 value={filter} onChange={e => setFilter(e.target.value)} />
        </div>

        {shown.length === 0 && <Empty icon={MessageSquare}>No messages yet.</Empty>}

        <div style={{ display: 'grid', gap: 8 }}>
          {shown.map(m => (
            <div key={m.id} style={{
              border: `1px solid ${LINE}`, borderRadius: 'var(--ui-radius-control)', padding: '12px 14px',
              display: 'flex', gap: 12, alignItems: 'flex-start',
              background: m.read ? 'transparent' : 'var(--ui-accent-soft)',
            }}>
              <span style={{
                fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, marginTop: 2,
                background: m.from === 'admin' ? ACCENT : STATUS.active.fg, color: m.from === 'admin' ? 'var(--ui-accent-fg)' : '#fff',
              }}>{m.from === 'admin' ? 'DT' : 'SHOP'}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{m.business || 'General'}</div>
                <div style={{ fontSize: 12.5, color: MUTED, whiteSpace: 'pre-wrap' }}>{m.text}</div>
                <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>
                  {new Date(m.createdAt).toLocaleString()}
                </div>
              </div>
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
