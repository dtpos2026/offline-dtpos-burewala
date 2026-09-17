import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Build stamp used both at runtime (see src/lib/version.ts) and baked into
// every hashed asset filename so a fresh deploy always produces brand-new
// URLs — this prevents browsers/CDNs from ever serving a stale chunk under
// a name that no longer exists on the server.
const BUILD_STAMP = Date.now().toString(36);

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: './',
  define: {
    // Build timestamp surfaced to the client (see src/lib/version.ts).
    __BUILD_STAMP__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Emit a manifest so hosting/CDNs can pin filenames if needed.
    manifest: true,
    // Strong cache-busting: each build gets its own stamp folder AND every
    // file keeps Vite's content hash. Old chunk URLs from a previous build
    // stop existing on the server so browsers cannot silently re-request them.
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-${BUILD_STAMP}-[hash].js`,
        chunkFileNames: `assets/[name]-${BUILD_STAMP}-[hash].js`,
        assetFileNames: `assets/[name]-${BUILD_STAMP}-[hash][extname]`,
      },
    },
  },
}));
