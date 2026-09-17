// Support tab — notes/messages between Digital Target and each shop,
// stored in Firestore so any staff machine sees the same thread.
import { useEffect, useMemo, useState } from 'react';
import {
  watchMessages, sendMessage, markMessageRead, deleteMessage, type SupportMessage,
} from './cloud';
import type { Client } from './registry';
import { ACCENT, INK_2, MUTED, LINE, STATUS, card, input, label, primaryBtn, ghostBtn } from './theme';

export default function Support({ clients }: { clients: Client[] }) {
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
      <section style={{ ...card, background: INK_2, border: `1px solid ${LINE}`, padding: 18 }}>
        <h2 style={{ fontSize: 15, fontWeight: 900, margin: '0 0 12px' }}>Send a message</h2>
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
        {err && <div style={{ marginTop: 10, fontSize: 12, color: '#B91C1C' }}>{err}</div>}
      </section>

      <section style={{ ...card, background: INK_2, border: `1px solid ${LINE}`, padding: 18 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 900, margin: 0 }}>Inbox</h2>
          <span style={{ fontSize: 11.5, color: MUTED }}>{msgs.length} message(s)</span>
          <input style={{ ...input, marginLeft: 'auto', maxWidth: 240 }} placeholder="Search…"
                 value={filter} onChange={e => setFilter(e.target.value)} />
        </div>

        {shown.length === 0 && (
          <div style={{ fontSize: 12.5, color: MUTED, padding: '18px 0', textAlign: 'center' }}>No messages yet.</div>
        )}

        <div style={{ display: 'grid', gap: 8 }}>
          {shown.map(m => (
            <div key={m.id} style={{
              border: `1px solid ${LINE}`, borderRadius: 12, padding: '10px 12px',
              display: 'flex', gap: 12, alignItems: 'flex-start',
              background: m.read ? 'transparent' : 'rgba(255,255,255,0.04)',
            }}>
              <span style={{
                fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 999,
                background: m.from === 'admin' ? ACCENT : STATUS.active.fg, color: '#fff',
              }}>{m.from === 'admin' ? 'DT' : 'SHOP'}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{m.business || 'General'}</div>
                <div style={{ fontSize: 12.5, color: MUTED, whiteSpace: 'pre-wrap' }}>{m.text}</div>
                <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>
                  {new Date(m.createdAt).toLocaleString()}
                </div>
              </div>
              {!m.read && <button style={ghostBtn} onClick={() => markMessageRead(m.id)}>Mark read</button>}
              <button style={ghostBtn} onClick={() => { if (confirm('Delete this message?')) deleteMessage(m.id); }}>Delete</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
