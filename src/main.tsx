import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
// UI fonts — Sora (display) + Manrope (body) + JetBrains Mono (receipts).
// Bundled locally via @fontsource so the offline EXE also gets the fonts
// without any CDN request.
import "@fontsource/sora/400.css";
import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";
import "@fontsource/sora/800.css";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import { startImagePrefetcher } from "./lib/imagePrefetch";
import "./lib/secureStorage"; // installs tenant-switch wipe + encrypted cache
import "./lib/sessionIsolation"; // strict cross-tenant cache wipe (localStorage / IDB / caches)
import { applyPrintMargins } from "./lib/printMargins";
applyPrintMargins();
import { applyPremiumPolish } from "./lib/premiumPolish";
applyPremiumPolish();

// ============================================================
// Stale-chunk auto-recovery.
// After a new deploy, the currently open tab still holds the OLD index.html
// which references OLD hashed chunk URLs that no longer exist on the server.
// Dynamic React.lazy() imports then fail with:
//   "Failed to fetch dynamically imported module: .../assets/XxxPage-<hash>.js"
// We detect that specific failure and do ONE automatic hard reload so the
// browser fetches the fresh index.html + fresh chunk URLs. A sessionStorage
// guard prevents an infinite reload loop if something else is wrong.
// ============================================================
(() => {
  const RELOAD_KEY = "__dt_chunk_reload_at";
  const isStaleChunkError = (msg: string) =>
    /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i.test(msg);

  const tryReload = (reason: string) => {
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      if (Date.now() - last < 30_000) return; // already reloaded in last 30s → give up
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      console.warn("[dt-chunk] stale chunk detected, reloading:", reason);
      // cache-bust query so proxies don't serve stale index.html either
      const u = new URL(window.location.href);
      u.searchParams.set("__cb", Date.now().toString(36));
      window.location.replace(u.toString());
    } catch {
      try { window.location.reload(); } catch {}
    }
  };

  window.addEventListener("error", (e) => {
    const msg = (e?.message || (e?.error && e.error.message) || "") + "";
    if (isStaleChunkError(msg)) tryReload(msg);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r: any = e?.reason;
    const msg = (r?.message || String(r || "")) + "";
    if (isStaleChunkError(msg)) tryReload(msg);
  });
  // Vite emits this custom event for preload failures
  window.addEventListener("vite:preloadError", (e: any) => {
    tryReload(e?.payload?.message || "vite:preloadError");
  });
})();

createRoot(document.getElementById("root")!).render(<App />);

// Background image prefetcher — saves menu/banner images to the local cache (offline ready)
startImagePrefetcher();
