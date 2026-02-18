import { test as base, expect, type Page } from "@playwright/test";
import {
  MOCK_ODDS_EVENTS,
  MOCK_NFL_EVENTS,
  ZERO_ENCODED,
  USDC_1000_ENCODED,
} from "./mock-data";

/**
 * Set up common page interceptors for authenticated E2E tests.
 * - Bypasses beta gate
 * - Mocks /api/odds to return deterministic events
 * - Mocks RPC calls for balance reads (so pages render without chain access)
 */
export async function setupAuthenticatedPage(page: Page) {
  // Bypass beta gate
  await page.addInitScript(() => {
    localStorage.setItem("djinn-beta-access", "true");
  });

  // Mock the odds API
  await page.route("**/api/odds**", async (route) => {
    const url = new URL(route.request().url());
    const sport = url.searchParams.get("sport") ?? "";

    let data = MOCK_ODDS_EVENTS;
    if (sport.includes("nfl") || sport.includes("football")) {
      data = MOCK_NFL_EVENTS;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });

  // Mock subgraph calls (protocol stats)
  await page.route("**/subgraphs/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          protocolStats: {
            totalVolume: "50000000000",
            totalSignals: "42",
            totalPurchases: "156",
          },
        },
      }),
    });
  });
}

/**
 * Extended test fixture with authenticated page setup.
 */
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await setupAuthenticatedPage(page);
    await use(page);
  },
});

export { expect };
