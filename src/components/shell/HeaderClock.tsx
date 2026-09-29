import { useEffect, useState } from 'react';

/**
 * The header's live clock. Its own component, so the once-a-second tick
 * re-renders this pill only — it used to re-render the whole layout, the
 * print host and the slip being printed with it, every second.
 */
export default function HeaderClock({ variant = 'classic' }: { variant?: 'classic' | 'modern' }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const date = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  if (variant === 'modern') {
    return (
      <div className="hidden items-center gap-2 rounded-[10px] border bg-card px-3 py-1.5 lg:flex" title={now.toLocaleString()}>
        <span className="font-mono text-[12.5px] font-bold tabular-nums text-foreground">{time}</span>
        <span className="h-3 w-px bg-border" />
        <span className="text-[12px] font-semibold text-muted-foreground">{date}</span>
      </div>
    );
  }
  return (
    <div className="hidden md:flex items-center gap-2 bg-sidebar-foreground/10 border border-sidebar-foreground/20 rounded-md px-2.5 py-1 shadow-inner">
      <span className="text-[11px] font-bold font-mono text-sidebar-foreground tabular-nums tracking-wider">{time}</span>
      <span className="h-3 w-px bg-sidebar-foreground/30" />
      <span className="text-[10px] font-semibold text-sidebar-foreground/85 tracking-wide">{date}</span>
    </div>
  );
}
