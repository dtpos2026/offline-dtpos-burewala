// ============================================================
// CUSTOMER DISPLAY SETTINGS
//
// Configures the screen above the counter: what it announces, how long a
// ready order stays up, and the banners or video shown beside the order
// columns.
//
// Banners are stored as data URLs in this device's own storage, which is a
// few megabytes in total. That is a real limit, not a soft one, so the card
// shows the current size, warns before it becomes a problem, and reports a
// quota failure plainly instead of pretending the upload worked.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Monitor, Plus, Trash2, Volume2, Image as ImageIcon, Film } from 'lucide-react';
import { toast } from 'sonner';
import {
  loadDisplayConfig,
  saveDisplayConfig,
  displayConfigSizeKb,
  announceOrder,
  type CustomerDisplayConfig,
  type DisplayMedia,
} from '@/lib/customerDisplay';

/** Beyond this the shop is close to the storage limit. */
const SIZE_WARN_KB = 3000;

export default function CustomerDisplaySettingsCard() {
  const [cfg, setCfg] = useState<CustomerDisplayConfig>(() => loadDisplayConfig());
  const fileRef = useRef<HTMLInputElement>(null);
  const [sizeKb, setSizeKb] = useState(0);

  useEffect(() => { setSizeKb(displayConfigSizeKb(cfg)); }, [cfg]);

  const commit = (next: CustomerDisplayConfig) => {
    const res = saveDisplayConfig(next);
    if (!res.ok) {
      toast.error(res.error || 'Could not save.');
      return false;
    }
    setCfg(next);
    return true;
  };

  const patch = (p: Partial<CustomerDisplayConfig>) => commit({ ...cfg, ...p });

  const addImages = async (files: FileList | null) => {
    if (!files?.length) return;
    const added: DisplayMedia[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) {
        toast.error(`${f.name} is not an image.`);
        continue;
      }
      // 1.5 MB is already a large banner for a screen; beyond that the shop
      // runs out of storage after two or three.
      if (f.size > 1_500_000) {
        toast.error(`${f.name} is ${(f.size / 1_000_000).toFixed(1)} MB. Use an image under 1.5 MB.`);
        continue;
      }
      const src = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(new Error('read failed'));
        r.readAsDataURL(f);
      }).catch(() => '');
      if (src) added.push({ id: `m${Date.now()}${added.length}`, kind: 'image', src });
    }
    if (added.length) {
      if (commit({ ...cfg, media: [...cfg.media, ...added] })) {
        toast.success(`${added.length} banner(s) added.`);
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const addVideo = () => {
    const src = window.prompt(
      'Video address\n\nA file path on this machine (file:///C:/promo.mp4) or a URL. '
      + 'The video itself is not copied into the settings, only its address, so it must stay where it is.',
    );
    if (!src || !src.trim()) return;
    if (commit({ ...cfg, media: [...cfg.media, { id: `v${Date.now()}`, kind: 'video', src: src.trim() }] })) {
      toast.success('Video added.');
    }
  };

  const remove = (id: string) => commit({ ...cfg, media: cfg.media.filter(m => m.id !== id) });

  const testVoice = () => {
    const r = announceOrder(101, cfg);
    if (!r.spoken) toast.error(r.reason || 'This device could not speak the announcement.');
    else toast.success('Announcement played.');
  };

  const openDisplay = async () => {
    const url = `${window.location.origin}${window.location.pathname}#/customer-display`;
    const api: any = (window as any).electronAPI;
    if (api?.openKdsWindow) {
      const res = await api.openKdsWindow({ url, fullscreen: true });
      if (res?.success) toast.success('Customer Display opened on the external screen.');
      else toast.error(`Could not open the display: ${res?.error || 'unknown error'}`);
      return;
    }
    window.open('#/customer-display', '_blank');
  };

  return (
    <Card className="p-4 md:p-6 space-y-5">
      <div className="flex items-start gap-3">
        <Monitor className="h-5 w-5 mt-0.5 shrink-0" />
        <div>
          <h3 className="text-lg font-semibold">Customer Display</h3>
          <p className="text-xs text-muted-foreground mt-1">
            The screen above the counter: which orders are being prepared, which
            are ready to collect, and your own banners or video in between.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-md border p-3">
        <div className="space-y-0.5 pr-4">
          <Label htmlFor="cd-enabled" className="text-sm">Enable customer display</Label>
          <p className="text-xs text-muted-foreground">Turn on before opening it on a screen.</p>
        </div>
        <Switch id="cd-enabled" checked={cfg.enabled} onCheckedChange={v => patch({ enabled: v })} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Heading</Label>
          <Input value={cfg.heading} onChange={e => patch({ heading: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Keep a ready order on screen (seconds)</Label>
          <Input type="number" min={10} max={600} value={cfg.readyHoldSeconds}
                 onChange={e => patch({ readyHoldSeconds: Number(e.target.value) || 90 })} />
        </div>
      </div>

      <div className="rounded-md border p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5 pr-4">
            <Label htmlFor="cd-announce" className="text-sm flex items-center gap-1.5">
              <Volume2 className="h-4 w-4" /> Announce the order number aloud
            </Label>
            <p className="text-xs text-muted-foreground">Spoken when an order becomes ready.</p>
          </div>
          <Switch id="cd-announce" checked={cfg.announce} onCheckedChange={v => patch({ announce: v })} />
        </div>

        {cfg.announce && (
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-xs">Wording — <code>{'{n}'}</code> becomes the order number</Label>
              <Input value={cfg.announceTemplate} onChange={e => patch({ announceTemplate: e.target.value })} />
            </div>
            <div className="flex items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Repeat</Label>
                <Input type="number" min={1} max={5} className="w-20"
                       value={cfg.announceRepeat}
                       onChange={e => patch({ announceRepeat: Number(e.target.value) || 1 })} />
              </div>
              <Button size="sm" variant="outline" onClick={testVoice}>Test the voice</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Uses the voice installed on this computer. If nothing is heard, no
              speech voice is installed in Windows — the test above will say so.
            </p>
          </div>
        )}
      </div>

      <div className="rounded-md border p-3 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Label className="text-sm">Banners and video</Label>
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                   onChange={e => addImages(e.target.files)} />
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <ImageIcon className="h-4 w-4 mr-1" /> Add image
            </Button>
            <Button size="sm" variant="outline" onClick={addVideo}>
              <Film className="h-4 w-4 mr-1" /> Add video
            </Button>
          </div>
        </div>

        {cfg.media.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No banners yet. Without any, the display shows only the order
            columns and uses the full width for them.
          </p>
        ) : (
          <div className="space-y-2">
            {cfg.media.map(m => (
              <div key={m.id} className="flex items-center gap-3 rounded-md border p-2">
                {m.kind === 'image'
                  ? <img src={m.src} alt="" className="h-12 w-20 object-cover rounded bg-muted" />
                  : <div className="h-12 w-20 rounded bg-muted flex items-center justify-center"><Film className="h-5 w-5" /></div>}
                <div className="flex-1 min-w-0">
                  <Input
                    placeholder="Caption (optional)"
                    value={m.caption || ''}
                    className="h-8 text-xs"
                    onChange={e => patch({
                      media: cfg.media.map(x => x.id === m.id ? { ...x, caption: e.target.value } : x),
                    })}
                  />
                  {m.kind === 'video' && (
                    <p className="text-[10px] text-muted-foreground truncate mt-1">{m.src}</p>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={() => remove(m.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            <div className="flex items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Seconds per banner</Label>
                <Input type="number" min={2} max={120} className="w-24"
                       value={cfg.mediaSeconds}
                       onChange={e => patch({ mediaSeconds: Number(e.target.value) || 8 })} />
              </div>
              <p className="text-xs text-muted-foreground pb-2">
                A video always plays to its end before the next item.
              </p>
            </div>
          </div>
        )}

        <p className={`text-xs ${sizeKb > SIZE_WARN_KB ? 'text-status-warning font-medium' : 'text-muted-foreground'}`}>
          Stored size: {sizeKb} KB
          {sizeKb > SIZE_WARN_KB && ' — close to this device\u2019s storage limit. Remove a banner before adding more.'}
        </p>
      </div>

      <Button onClick={openDisplay} disabled={!cfg.enabled}>
        <Monitor className="h-4 w-4 mr-1" /> Open Customer Display
      </Button>
      {!cfg.enabled && (
        <p className="text-xs text-muted-foreground">Enable the display above to open it.</p>
      )}
    </Card>
  );
}
