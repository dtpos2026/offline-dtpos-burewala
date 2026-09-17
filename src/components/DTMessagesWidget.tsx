// Floating "Messages" button — shop ↔ Digital Target notes.
// Uses the same cloud collection the Super Admin panel reads/writes,
// so a message sent from either side is visible on the other.
import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Loader2, RefreshCw } from 'lucide-react';
import {
  fetchMessages, sendShopMessage, cachedMessages, markAllRead, unreadCount,
  type DTMessage, type MessageContext,
} from '@/lib/cloudMessages';
import { Button } from '@/components/ui/button';

function isReportsDashboard(): boolean {
  // Hash-router safe: works even if this widget is ever mounted outside a Router.
  return window.location.hash.replace(/^#/, '').split('?')[0] === '/reports';
}

export default function DTMessagesWidget() {
  const [onReports, setOnReports] = useState(isReportsDashboard());
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<DTMessage[]>(cachedMessages());
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const ctxRef = useRef<MessageContext>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onNav = () => setOnReports(isReportsDashboard());
    window.addEventListener('hashchange', onNav);
    window.addEventListener('popstate', onNav);
    return () => {
      window.removeEventListener('hashchange', onNav);
      window.removeEventListener('popstate', onNav);
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { loadLicense } = await import('@/licensing/licenseService');
        const lic = await loadLicense();
        if (lic) ctxRef.current = { licenseKey: lic.licenseKey, business: lic.businessName, phone: lic.mobileNumber };
      } catch { /* offline build */ }
    })();
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setMsgs(await fetchMessages(ctxRef.current)); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (open) { markAllRead(); scrollRef.current?.scrollTo({ top: 999999, behavior: 'smooth' }); }
  }, [open, msgs.length]);

  const unread = open ? 0 : unreadCount(msgs);

  // Sirf Reports Dashboard par — baqi har screen par bilkul hidden.
  if (!onReports) return null;

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setNote('');
    const ok = await sendShopMessage(body, ctxRef.current);
    if (ok) {
      setText('');
      await refresh();
    } else {
      setNote('Message could not be sent — check your internet and try again.');
    }
    setBusy(false);
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:opacity-90"
          aria-label="Messages"
        >
          <MessageCircle className="h-6 w-6" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-destructive px-1 text-xs font-bold text-destructive-foreground">
              {unread}
            </span>
          )}
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[520px] w-[360px] max-w-[92vw] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
          <div className="flex items-center gap-2 border-b bg-primary px-4 py-3 text-primary-foreground">
            <MessageCircle className="h-4 w-4" />
            <div className="flex-1">
              <p className="text-sm font-semibold leading-tight">Digital Target Messages</p>
              <p className="text-[11px] opacity-80">Support &amp; licence notes</p>
            </div>
            <button onClick={refresh} aria-label="Refresh" className="opacity-80 hover:opacity-100">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => setOpen(false)} aria-label="Close" className="opacity-80 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-muted/30 p-3">
            {msgs.length === 0 && (
              <p className="mt-10 text-center text-xs text-muted-foreground">
                No messages yet. Write below to reach Digital Target.
              </p>
            )}
            {msgs.map(m => (
              <div key={m.id} className={`flex ${m.from === 'shop' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                  m.from === 'shop' ? 'bg-primary text-primary-foreground' : 'border bg-card'
                }`}>
                  <p className="whitespace-pre-wrap">{m.text}</p>
                  <p className="mt-1 text-[10px] opacity-70">
                    {m.from === 'admin' ? 'Digital Target' : 'You'} · {m.createdAt ? new Date(m.createdAt).toLocaleString() : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {note && <p className="px-3 pt-2 text-[11px] text-destructive">{note}</p>}

          <div className="flex items-center gap-2 border-t p-2">
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send(); }}
              placeholder="Write a message…"
              className="flex-1 rounded-md border bg-background px-3 py-2 text-xs outline-none"
            />
            <Button size="sm" onClick={send} disabled={busy || !text.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
