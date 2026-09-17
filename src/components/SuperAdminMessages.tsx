// Super Admin → Messages tab (WhatsApp-style: left list, right chat)
import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Send, Phone, Search, ShieldCheck } from 'lucide-react';
import { cloudAuth, cloudDb } from '@/lib/offlineNoCloud';
import { collectionGroup, onSnapshot, query, orderBy } from '@/lib/offlineNoCloud';
import {
  sendSupportMessage, markRead, fetchTenantPhone, waLink,
  type SupportMessage,
} from '@/lib/support';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ClientLite {
  tenantId: string;
  name: string;
  email?: string;
  plan?: string;
}

interface Props {
  clients: ClientLite[];
}

interface ConvoSummary {
  tenantId: string;
  lastMsg?: SupportMessage;
  unread: number;
  all: SupportMessage[];
}

const QUICK = [
  'Salam! Subscription renew karwa lein.',
  'Reminder: your invoice is unpaid, please clear it.',
  'Thank you, payment has been received.',
  'Account has expired, please renew immediately.',
];

export default function SuperAdminMessages({ clients }: Props) {
  const [all, setAll] = useState<Record<string, SupportMessage[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState('');
  const [phone, setPhone] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Listen to ALL tenants' support messages in one shot (collectionGroup)
  useEffect(() => {
    try {
      const q = query(collectionGroup(cloudDb(), 'support'), orderBy('createdAt', 'asc'));
      return onSnapshot(q, snap => {
        const map: Record<string, SupportMessage[]> = {};
        snap.docs.forEach(d => {
          const parts = d.ref.path.split('/'); // tenants/{tid}/support/{id}
          const tid = parts[1];
          if (!map[tid]) map[tid] = [];
          map[tid].push({ id: d.id, ...(d.data() as any) });
        });
        setAll(map);
      }, err => console.warn('messages listen', err));
    } catch (e) { console.warn(e); }
  }, []);

  // Summaries by tenant
  const convos: ConvoSummary[] = useMemo(() => {
    const byTid = new Map<string, ConvoSummary>();
    clients.forEach(c => byTid.set(c.tenantId, { tenantId: c.tenantId, all: [], unread: 0 }));
    Object.entries(all).forEach(([tid, msgs]) => {
      const cur = byTid.get(tid) || { tenantId: tid, all: [], unread: 0 };
      cur.all = msgs;
      cur.lastMsg = msgs[msgs.length - 1];
      cur.unread = msgs.filter(m => m.from === 'owner' && !m.read).length;
      byTid.set(tid, cur);
    });
    // sort: unread first, then by latest message
    return Array.from(byTid.values()).sort((a, b) => {
      if (a.unread !== b.unread) return b.unread - a.unread;
      const at = a.lastMsg?.createdAt?.toMillis?.() || 0;
      const bt = b.lastMsg?.createdAt?.toMillis?.() || 0;
      return bt - at;
    });
  }, [all, clients]);

  const visibleConvos = convos.filter(c => {
    if (!filter) return true;
    const cli = clients.find(x => x.tenantId === c.tenantId);
    const blob = `${cli?.name || ''} ${cli?.email || ''}`.toLowerCase();
    return blob.includes(filter.toLowerCase());
  });

  const totalUnread = convos.reduce((s, c) => s + c.unread, 0);

  const activeMsgs = selected ? (all[selected] || []) : [];
  const activeClient = clients.find(c => c.tenantId === selected);

  useEffect(() => {
    if (!selected) { setPhone(''); return; }
    markRead(selected, 'admin');
    fetchTenantPhone(selected).then(setPhone);
  }, [selected, activeMsgs.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 99999, behavior: 'smooth' });
  }, [activeMsgs.length, selected]);

  const send = async () => {
    if (!selected) return;
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      const email = cloudAuth().currentUser?.email || '';
      await sendSupportMessage(selected, 'admin', body, email);
      setText('');
    } catch (e) { console.error(e); }
    setSending(false);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-3 h-[calc(100vh-280px)] min-h-[500px]">
      {/* LEFT — list */}
      <div className="border rounded-xl bg-card flex flex-col overflow-hidden">
        <div className="p-3 border-b bg-violet-600 text-white">
          <div className="flex items-center justify-between mb-2">
            <div className="font-bold text-sm flex items-center gap-1.5">
              <MessageCircle className="h-4 w-4" /> Inbox
            </div>
            {totalUnread > 0 && (
              <span className="text-[10px] bg-red-500 px-1.5 py-0.5 rounded-full font-bold">{totalUnread} new</span>
            )}
          </div>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-white/70" />
            <Input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Search restaurants…"
              className="h-8 pl-7 text-xs bg-white/15 border-white/20 text-white placeholder:text-white/60"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {visibleConvos.length === 0 && (
            <div className="p-6 text-center text-xs text-muted-foreground">No conversations</div>
          )}
          {visibleConvos.map(c => {
            const cli = clients.find(x => x.tenantId === c.tenantId);
            if (!cli) return null;
            const active = selected === c.tenantId;
            const last = c.lastMsg;
            const preview = last ? (last.from === 'admin' ? '✓ ' : '') + (last.body || '').slice(0, 40) : 'No messages yet';
            const time = last?.createdAt?.toDate?.()?.toLocaleDateString() || '';
            return (
              <button
                key={c.tenantId}
                onClick={() => setSelected(c.tenantId)}
                className={`w-full text-left px-3 py-2.5 border-b hover:bg-muted/40 transition flex items-start gap-2 ${active ? 'bg-violet-500/10 border-l-4 border-l-violet-600' : ''}`}
              >
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                  {(cli.name || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <div className="font-bold text-sm truncate">{cli.name}</div>
                    {time && <div className="text-[9px] text-muted-foreground shrink-0">{time}</div>}
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <div className={`text-[11px] truncate ${c.unread > 0 ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>
                      {preview}
                    </div>
                    {c.unread > 0 && (
                      <span className="text-[9px] bg-red-600 text-white rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center font-bold shrink-0">
                        {c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* RIGHT — chat */}
      <div className="border rounded-xl bg-card flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
            <MessageCircle className="h-16 w-16 mb-3 opacity-20" />
            <div className="font-bold text-sm">Select a restaurant from the left</div>
            <div className="text-xs mt-1">Start a chat with the owner</div>
          </div>
        ) : (
          <>
            <div className="p-3 border-b flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center font-bold text-sm">
                  {(activeClient?.name || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{activeClient?.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{activeClient?.email}</div>
                </div>
              </div>
              {phone && (
                <a href={waLink(phone, `Salam ${activeClient?.name || ''},`)} target="_blank" rel="noreferrer"
                  className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-600 text-white hover:bg-green-700">
                  <Phone className="h-3 w-3" /> WhatsApp
                </a>
              )}
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 bg-muted/20">
              {activeMsgs.length === 0 && (
                <div className="text-center text-xs text-muted-foreground py-10">Send the first message</div>
              )}
              {activeMsgs.map(m => (
                <div key={m.id} className={`flex ${m.from === 'admin' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3 py-1.5 text-xs shadow-sm ${
                    m.from === 'admin'
                      ? 'bg-violet-600 text-white rounded-br-sm'
                      : 'bg-card border rounded-bl-sm'
                  }`}>
                    {m.from === 'admin' && (
                      <div className="text-[9px] font-bold uppercase opacity-80 mb-0.5 flex items-center gap-1">
                        <ShieldCheck className="h-2.5 w-2.5" /> Digital Target
                      </div>
                    )}
                    <div className="whitespace-pre-wrap break-words">{m.body}</div>
                    <div className={`text-[9px] mt-0.5 ${m.from === 'admin' ? 'text-white/70' : 'text-muted-foreground'}`}>
                      {m.createdAt?.toDate?.()?.toLocaleString() || '…'}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t bg-card">
              <div className="px-2 py-1.5 flex flex-wrap gap-1 border-b">
                {QUICK.map((q, i) => (
                  <button key={i} onClick={() => setText(q)}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-muted hover:bg-violet-100 border">
                    {q.slice(0, 30)}…
                  </button>
                ))}
              </div>
              <div className="p-2 flex gap-1.5">
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Reply likhein…"
                  rows={2}
                  className="flex-1 px-3 py-1.5 text-xs border rounded-lg bg-background outline-none focus:border-violet-500 resize-none"
                />
                <Button size="sm" disabled={sending || !text.trim()} onClick={send}
                  className="bg-violet-600 hover:bg-violet-700 text-white self-end">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
