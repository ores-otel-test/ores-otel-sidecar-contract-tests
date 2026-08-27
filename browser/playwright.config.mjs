import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "playwright.spec.mjs",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.SIDECAR_URL || "http://127.0.0.1:9090",
    headless: true,
    channel: "chrome",
    ignoreHTTPSErrors: true,
    trace: "off",
  },
});
