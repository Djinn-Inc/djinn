import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for testing the live djinn.gg site.
 * No local webServer — tests run against the deployed production URL.
 *
 * Usage: pnpm exec playwright test --config playwright.live.config.ts
 */
export default defineConfig({
  testDir: "./e2e/live",
  fullyParallel: true,
  retries: 1,
  workers: 2,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  use: {
    baseURL: "https://djinn.gg",
    trace: "on-first-retry",
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 5"] },
    },
  ],
});
