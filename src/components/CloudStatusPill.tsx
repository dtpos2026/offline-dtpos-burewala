// ============================================================
// Cloud Status Pill — the one simple indicator restaurant staff sees.
// No technical detail: Server Online / Offline Mode / Syncing / Error.
// ============================================================
import { useEffect, useState } from 'react';
import { Cloud, CloudOff, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { subscribeLink, linkLabel, lastSyncAt, type LinkState } from '@/lib/cloudLink';

const STYLE: Record<LinkState, { cls: string; Icon: any }> = {
  online:    { cls: 'text-green-700 bg-green-50 border-green-200', Icon: Cloud },
  connecting: { cls: 'text-slate-600 bg-slate-50 border-slate-200', Icon: Loader2 },
  syncing:   { cls: 'text-blue-700 bg-blue-50 border-blue-200', Icon: Loader2 },
  verifying: { cls: 'text-blue-700 bg-blue-50 border-blue-200', Icon: ShieldCheck },
  error:     { cls: 'text-amber-700 bg-amber-50 border-amber-200', Icon: AlertTriangle },
  offline:   { cls: 'text-slate-600 bg-slate-50 border-slate-200', Icon: CloudOff },
};

export default function CloudStatusPill() {
  const [state, setState] = useState<LinkState>('offline');
  useEffect(() => subscribeLink(setState), []);

  const { cls, Icon } = STYLE[state];
  const synced = lastSyncAt();
  const title = synced ? `Last sync: ${new Date(synced).toLocaleString()}` : 'Local mode — no server contact yet';

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${cls}`}
    >
      <Icon className={`h-3 w-3 ${state === 'syncing' || state === 'connecting' ? 'animate-spin' : ''}`} />
      {linkLabel(state)}
    </span>
  );
}
