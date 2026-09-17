// Cloud-backed Day Close snapshots + audit log.
// Local JSON download stays (user safety), but we also push a copy to
// the cloud so backup history survives across devices / browser resets.
import { getTenantId } from './tenant';
import { cloudDb, isCloudConfigured } from './offlineNoCloud';
import { doc, setDoc, collection, getDocs, query, orderBy, limit, deleteDoc, serverTimestamp } from '@/lib/offlineNoCloud';

export interface DayCloseLogEntry {
  id: string;
  closedAt: string;          // ISO
  closedByUid: string;
  closedByName: string;
  orderCount: number;
  cleared: {
    paid: number;
    runningHold: number;
    voidComp: number;
    credit: number;
  };
  config: Record<string, boolean>;
  backupBytes?: number;
}

const MAX_BACKUPS = 30; // keep last 30 day-close JSON snapshots in cloud

function backupsCol() {
  if (!isCloudConfigured()) return null;
  const tid = getTenantId(); if (!tid) return null;
  return collection(cloudDb(), 'tenants', tid, 'dayCloseBackups');
}
function logCol() {
  if (!isCloudConfigured()) return null;
  const tid = getTenantId(); if (!tid) return null;
  return collection(cloudDb(), 'tenants', tid, 'dayCloseLog');
}

/** Save backup JSON to the cloud. Returns true on success. Best-effort. */
export async function saveBackupToCloud(json: string, id: string): Promise<boolean> {
  const col = backupsCol(); if (!col) return false;
  try {
    // cloud document size limit ~1MB. Chunk if larger.
    const bytes = new TextEncoder().encode(json).length;
    if (bytes <= 900_000) {
      await setDoc(doc(col, id), {
        id, json, bytes,
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
      });
    } else {
      // Split into ~800KB chunks
      const chunkSize = 800_000;
      const chunks: string[] = [];
      for (let i = 0; i < json.length; i += chunkSize) chunks.push(json.slice(i, i + chunkSize));
      await setDoc(doc(col, id), {
        id, bytes,
        chunked: true,
        chunkCount: chunks.length,
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
      });
      for (let i = 0; i < chunks.length; i++) {
        await setDoc(doc(col, `${id}__${i}`), { parentId: id, index: i, data: chunks[i] });
      }
    }
    // Prune old
    pruneOldBackups().catch(() => {});
    return true;
  } catch (e) {
    console.error('[dayCloseBackup] cloud save failed', e);
    return false;
  }
}

async function pruneOldBackups() {
  const col = backupsCol(); if (!col) return;
  try {
    const snap = await getDocs(query(col, orderBy('createdAtMs', 'desc'), limit(MAX_BACKUPS + 50)));
    const docs = snap.docs.filter(d => !d.id.includes('__'));
    if (docs.length <= MAX_BACKUPS) return;
    const toDelete = docs.slice(MAX_BACKUPS);
    for (const d of toDelete) {
      await deleteDoc(d.ref);
      // delete chunks if any
      const data = d.data() as any;
      if (data?.chunked && data?.chunkCount) {
        for (let i = 0; i < data.chunkCount; i++) {
          try { await deleteDoc(doc(col, `${d.id}__${i}`)); } catch {}
        }
      }
    }
  } catch {}
}

/** Append an audit-log entry for this Day Close. */
export async function logDayCloseEvent(entry: DayCloseLogEntry): Promise<void> {
  const col = logCol(); if (!col) return;
  try {
    await setDoc(doc(col, entry.id), {
      ...entry,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.error('[dayCloseBackup] audit log failed', e);
  }
}
