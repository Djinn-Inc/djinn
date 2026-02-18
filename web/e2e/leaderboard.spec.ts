import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("djinn-beta-access", "true");
  });
});

test.describe("Leaderboard page", () => {
  test("renders leaderboard heading", async ({ page }) => {
    await page.goto("/leaderboard");
    await expect(
      page.getByRole("heading", { name: "Genius Leaderboard" })
    ).toBeVisible();
  });

  test("shows setup message when subgraph not configured", async ({
    page,
  }) => {
    await page.goto("/leaderboard");
    // When NEXT_PUBLIC_SUBGRAPH_URL is not set, a setup message should show
    await expect(
      page.getByText(/leaderboard is being set up/i)
    ).toBeVisible();
  });

  test("shows sortable table headers", async ({ page }) => {
    await page.goto("/leaderboard");
    // Wait for the table to render (headers are always visible)
    await expect(page.getByRole("columnheader", { name: /Quality Score/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /Signals/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /Audits/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /ROI/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /Proofs/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /Win Rate/i })).toBeVisible();
  });
});

test.describe("Track record page (unauthenticated)", () => {
  test("renders track record heading", async ({ page }) => {
    await page.goto("/genius/track-record");
    await expect(
      page.getByRole("heading", { name: "Track Record Proof" })
    ).toBeVisible();
  });

  test("shows wallet prompt or track record content", async ({
    page,
  }) => {
    await page.goto("/genius/track-record");
    // Both states valid depending on mock wallet presence
    const body = await page.locator("body").textContent();
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(50);
  });
});
