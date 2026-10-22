// Dev server for the User Guide screenshots.
//   DOCS_REAL_GATE=1  → the real licence screen (for the activation chapter)
//   otherwise         → the app opens straight away (stub-license-gate.tsx)
// Run from the repository root:
//   npx vite --config docs/user-guide/tools/vite.docs.config.mjs --port 5201
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const realGate = process.env.DOCS_REAL_GATE === '1';

export default defineConfig({
  root: repo,
  base: '/',
  define: { __BUILD_STAMP__: JSON.stringify(new Date().toISOString()) },
  server: { host: '127.0.0.1', hmr: false },
  plugins: [react()],
  resolve: {
    alias: [
      ...(realGate ? [] : [{ find: /^@\/licensing\/LicenseGate$/, replacement: path.join(here, 'stub-license-gate.tsx') }]),
      { find: '@', replacement: path.join(repo, 'src') },
    ],
  },
});
