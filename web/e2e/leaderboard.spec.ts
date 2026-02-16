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

  test("shows subgraph configuration warning when not configured", async ({
    page,
  }) => {
    await page.goto("/leaderboard");
    // When NEXT_PUBLIC_SUBGRAPH_URL is not set, a warning should show
    await expect(
      page.getByText(/subgraph is not configured/i)
    ).toBeVisible();
  });

  test("shows sortable table headers", async ({ page }) => {
    await page.goto("/leaderboard");
    await expect(page.getByText("Quality Score")).toBeVisible();
    await expect(page.getByText("Signals")).toBeVisible();
    await expect(page.getByText("Audits")).toBeVisible();
    await expect(page.getByText("ROI")).toBeVisible();
  });
});

test.describe("Track record page (unauthenticated)", () => {
  test("renders track record heading", async ({ page }) => {
    await page.goto("/genius/track-record");
    await expect(
      page.getByRole("heading", { name: "Track Record Proof" })
    ).toBeVisible();
  });

  test("shows connect wallet prompt when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/genius/track-record");
    await expect(
      page.getByText(/connect your wallet/i)
    ).toBeVisible();
  });
});
