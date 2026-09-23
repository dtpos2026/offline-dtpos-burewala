import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    // "@pos" is the Super Admin's alias for the POS sources (superadmin/vite.config.ts),
    // so Super Admin screens can be tested here too.
    alias: { "@": path.resolve(__dirname, "./src"), "@pos": path.resolve(__dirname, "./src") },
  },
});
