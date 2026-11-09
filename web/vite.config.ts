/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the site calls /api/... on its own origin and Vite forwards to the local API,
// so no CORS setting is needed. In production VITE_API_BASE_URL points to the deployed API.
const API_TARGET = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // Outputs of the browser tests are not source: watching them (and their deletion before a
    // new run) only restarts or stops the dev server on Windows.
    watch: { ignored: ["**/test-results/**", "**/playwright-report/**"] },
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true },
      "/health": { target: API_TARGET, changeOrigin: true },
      "/docs": { target: API_TARGET, changeOrigin: true },
      "/openapi.json": { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    globals: false,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    restoreMocks: true,
  },
});
