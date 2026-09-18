// ============================================================
// KITCHEN DISPLAY CENTER — choose the screen, open the display.
//
// What the OS can tell us, and what it cannot
// ------------------------------------------
// Electron reports the displays the operating system has: label, resolution,
// scale, position, and which is primary. It does NOT report the cable. There
// is no API that says "this monitor is on HDMI" — so an HDMI/USB/VGA picker
// would be a label with nothing behind it.
//
// This lists what is real instead. A kitchen TV on HDMI, a second monitor on
// VGA and a USB display adapter all appear the same way here, because once
// the OS has them they ARE the same thing to the application: a screen with
// bounds a window can be placed on. Whichever cable it arrived by, the
// Kitchen Display lands on the screen you pick.
// ============================================================
import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tv, Monitor, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';

interface DisplayInfo {
  id: number;
  label: string;
  width: number;
  height: number;
  scaleFactor: number;
  primary: boolean;
  internal: boolean;
}

interface Props {
  /** Which kitchen the display should show. */
  kitchen: string;
}

/**
 * What to put on the second screen.
 *
 * Two genuinely different audiences: the KITCHEN board is dense and is read
 * by cooks who act on it, while the CUSTOMER display answers one question for
 * someone standing at the counter. A shop may want either, and with two
 * external screens it may want both.
 */
type Content = 'kitchen' | 'customer';

function api(): any {
  return (window as any).electronAPI;
}

export default function KitchenDisplayCenter({ kitchen }: Props) {
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<Content>('kitchen');
  const desktop = !!api()?.listDisplays;

  const refresh = useCallback(async () => {
    if (!desktop) return;
    try {
      const res = await api().listDisplays();
      if (!res?.success) return;
      const list: DisplayInfo[] = res.displays || [];
      setDisplays(list);
      // Default to the first EXTERNAL screen — a kitchen display on the
      // cashier's own monitor helps nobody.
      setSelected(prev => {
        if (prev !== null && list.some(d => d.id === prev)) return prev;
        return (list.find(d => !d.primary) || list[0])?.id ?? null;
      });
      const st = await api().isKdsWindowOpen?.();
      setOpen(!!st?.open);
    } catch { /* leave the last known list */ }
  }, [desktop]);

  useEffect(() => {
    refresh();
    // Displays come and go while the app runs — a TV is switched on, a cable
    // is pulled. Re-read on focus so the list is not stale when it is used.
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const launch = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const url = content === 'customer'
        ? `${window.location.origin}${window.location.pathname}#/customer-display`
        : `${window.location.origin}${window.location.pathname}#/kds-tv?kitchen=${encodeURIComponent(kitchen)}`;
      const res = await api().openKdsWindow({ url, displayId: selected, fullscreen: true });
      if (res?.success) {
        setOpen(true);
        const d = displays.find(x => x.id === res.displayId);
        const what = content === 'customer' ? 'Customer Display' : 'Kitchen board';
        toast.success(`${what} opened on ${d ? d.label : 'the selected screen'}.`);
      } else {
        toast.error(`Could not open the display: ${res?.error || 'unknown error'}`);
      }
    } catch (e: any) {
      toast.error(`Could not open the display: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    setBusy(true);
    try {
      await api().closeKdsWindow();
      setOpen(false);
      toast.success('Kitchen Display closed.');
    } finally {
      setBusy(false);
    }
  };

  // Browser build: no second window to place, so fall back to the tab the
  // app already used. Saying so is better than showing a dead picker.
  if (!desktop) {
    return (
      <Card className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Tv className="h-5 w-5 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold">Kitchen Display</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Screen selection is available in the desktop app. In the browser the
              display opens in a new tab, which you can move to the kitchen screen
              yourself.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => window.open(`#/kds-tv?kitchen=${encodeURIComponent(kitchen)}`, '_blank')}>
            <Tv className="h-4 w-4 mr-1" /> Kitchen board
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.open('#/customer-display', '_blank')}>
            <Monitor className="h-4 w-4 mr-1" /> Customer display
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Tv className="h-5 w-5 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold">Display Center</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Choose what to show and which screen to show it on.
            </p>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={refresh} title="Re-read connected screens">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium">What should this screen show?</p>
        <div className="flex gap-2">
          <Button
            type="button" size="sm"
            variant={content === 'kitchen' ? 'default' : 'outline'}
            onClick={() => setContent('kitchen')}
          >
            Kitchen board
          </Button>
          <Button
            type="button" size="sm"
            variant={content === 'customer' ? 'default' : 'outline'}
            onClick={() => setContent('customer')}
          >
            Customer display
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {content === 'kitchen'
            ? 'The dense board cooks work from — every active order and its items.'
            : 'The screen above the counter: preparing, ready to collect, and your banners.'}
        </p>
      </div>

      {displays.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No screens reported yet. Connect the kitchen display and press refresh.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {displays.map(d => {
            const active = d.id === selected;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelected(d.id)}
                className={`text-left rounded-lg border p-3 transition-all ${
                  active
                    ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
                    : 'border-border hover:border-primary/40'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Monitor className={`h-4 w-4 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="font-medium text-sm truncate">{d.label}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 font-mono">
                  {d.width} × {d.height}
                  {d.scaleFactor !== 1 ? ` @ ${d.scaleFactor}×` : ''}
                </p>
                <div className="flex gap-1 mt-2">
                  {d.primary && <Badge variant="secondary" className="text-[10px]">Primary</Badge>}
                  {!d.primary && <Badge className="text-[10px] bg-status-success/20 text-status-success border-status-success/30">External</Badge>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={launch} disabled={busy || selected === null}>
          <Tv className="h-4 w-4 mr-1" />
          {open
            ? 'Reopen on this screen'
            : content === 'customer' ? 'Open Customer Display' : 'Open Kitchen Board'}
        </Button>
        {open && (
          <Button variant="outline" onClick={close} disabled={busy}>
            <X className="h-4 w-4 mr-1" /> Close display
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        The list shows every screen Windows reports, however it is connected —
        HDMI, VGA, DisplayPort or a USB adapter. Windows does not tell an
        application which cable a monitor is on, so the screens are identified
        by name and resolution instead of a cable label.
      </p>
    </Card>
  );
}
