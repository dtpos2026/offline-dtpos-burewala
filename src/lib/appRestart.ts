// "Restart application to apply changes".
//
// The Modern / Classic switch and the accent colour apply instantly, so a
// restart is never required — this exists for the shop that wants the app to
// come back up fresh (it is also how a change of language or zoom is picked up
// everywhere at once). It NEVER clears anything: local data, the licence,
// users, settings and printer configuration stay exactly where they are.
// Before restarting, pending writes are flushed to disk.
import { flushLocalStoreToDisk } from '@/lib/store';

export function canRestartApp(): boolean {
  try { return typeof (window as any).electronAPI?.restartApp === 'function'; } catch { return false; }
}

export async function restartApp(): Promise<void> {
  try { await flushLocalStoreToDisk(); } catch { /* the store also flushes on its own timer */ }
  try {
    const api = (window as any).electronAPI;
    if (typeof api?.restartApp === 'function') {
      const r = await api.restartApp();
      if (r && r.ok === false) throw new Error(r.error || 'restart failed');
      return; // the process is being replaced
    }
  } catch { /* fall through to a plain reload */ }
  window.location.reload();
}
