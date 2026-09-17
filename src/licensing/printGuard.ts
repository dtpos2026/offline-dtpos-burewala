// ============================================================
// PRINT GUARD — licence + device binding ka aakhri darwaza.
//
// Gate app khulte waqt licence check karta hai, lekin agar vault kisi doosri
// machine par copy ho jaye, licence expire ho jaye ya clock badal diya jaye
// to bill print NAHI hona chahiye. Har silent/browser print isi guard se
// guzarta hai. Result 60 second cache hota hai taake fast billing slow na ho.
// ============================================================
import { verifyStored, loadLicense, blockMessage } from './licenseService';

export interface PrintGuardResult {
  allowed: boolean;
  reason?: string;
  message?: string;
}

const CACHE_MS = 60_000;
let cached: { at: number; result: PrintGuardResult } | null = null;
let inflight: Promise<PrintGuardResult> | null = null;

/** Force the next check to hit the vault again (after activation / unlink). */
export function resetPrintGuardCache() {
  cached = null;
}

export function lastPrintGuardResult(): PrintGuardResult | null {
  return cached?.result ?? null;
}

async function check(): Promise<PrintGuardResult> {
  try {
    const lic = await loadLicense();
    // Dev/browser mode ya abhi tak activate hi nahi hua — gate khud sambhalta hai.
    if (!lic) return { allowed: true };

    const v = await verifyStored(lic.appVersion || '');
    if (v.ok) return { allowed: true };

    const reason = v.reason || 'invalid';
    return {
      allowed: false,
      reason,
      message: v.message || blockMessage(reason),
    };
  } catch {
    // Guard ki apni error kabhi billing na roke.
    return { allowed: true };
  }
}

/** Returns whether printing is allowed on THIS device right now. */
export async function ensurePrintAllowed(): Promise<PrintGuardResult> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.result;
  if (inflight) return inflight;

  inflight = check()
    .then((result) => {
      cached = { at: Date.now(), result };
      if (!result.allowed) notifyBlocked(result);
      return result;
    })
    .finally(() => { inflight = null; });

  return inflight;
}

// ============================================================
// FAST PATH — click karte hi print nikalna chahiye.
// Cached natija foran wapas, aur refresh background me. Sirf pehli dafa
// (jab cache khali ho) thoda intezar, woh bhi max 700ms — uske baad print
// chal padti hai aur guard background me check kar ke block dikha deta hai.
// ============================================================
const STALE_OK_MS = 10 * 60_000;

/** Warm the guard up (app start / login) so the first bill has zero wait. */
export function prewarmPrintGuard() {
  try { void ensurePrintAllowed(); } catch {}
}

export async function ensurePrintAllowedFast(): Promise<PrintGuardResult> {
  const age = cached ? Date.now() - cached.at : Infinity;

  if (cached && age < CACHE_MS) return cached.result;

  // Thoda purana lekin qabil-e-bharosa natija: foran istemal karo, background refresh.
  // Sirf "allowed" natije par shortcut — blocked hamesha dobara check hota hai.
  if (cached && cached.result.allowed && age < STALE_OK_MS) {
    if (!inflight) void ensurePrintAllowed();
    return cached.result;
  }

  // Pehli dafa: poora check mukammal hone tak intezar. Ghalat device par
  // ek bhi bill nahi nikalna chahiye, is liye yahan koi timeout shortcut nahi.
  return ensurePrintAllowed();
}


/** Broadcast so the global dialog can pop up wherever the user is. */
export function notifyBlocked(result: PrintGuardResult) {
  try {
    window.dispatchEvent(new CustomEvent('dtpos-print-blocked', { detail: result }));
  } catch { /* non-browser */ }
}

export function onPrintBlocked(handler: (r: PrintGuardResult) => void): () => void {
  const fn = (e: Event) => handler((e as CustomEvent).detail as PrintGuardResult);
  window.addEventListener('dtpos-print-blocked', fn);
  return () => window.removeEventListener('dtpos-print-blocked', fn);
}
