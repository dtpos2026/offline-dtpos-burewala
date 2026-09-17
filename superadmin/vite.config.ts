import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// The generator shares ONE source of truth with the POS: the key
// encode/verify module. Aliased instead of copied so a format change can
// never drift between the tool that mints keys and the app that checks them.
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: { '@pos': path.resolve(__dirname, '../src') },
  },
  server: {
    port: 5180,
    fs: { allow: [path.resolve(__dirname, '..')] },
  },
  build: { outDir: 'dist' },
});
