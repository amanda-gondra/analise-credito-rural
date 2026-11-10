/**
 * End-to-end and visual checks in a real browser, against the local API with the loaded
 * database (uvicorn on 127.0.0.1:8000). Uses the Chrome already installed on the machine
 * (channel "chrome"), so no browser download is needed. Run: npm run e2e
 *
 * The assistant's answers are served by a route mock in the tests, so they never spend the
 * language model's quota; everything else comes from the real API.
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results/artifacts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: 3,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173",
    channel: process.env.E2E_CHANNEL ?? "chrome",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
