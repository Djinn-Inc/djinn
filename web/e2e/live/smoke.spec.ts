import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("djinn-beta-access", "true");
  });
});

test.describe("Live site smoke tests", () => {
  test("home page loads with branding", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "DJINN" })).toBeVisible();
    await expect(page.getByText("The Genius-Idiot Network")).toBeVisible();
  });

  test("genius dashboard loads without infinite spinner", async ({ page }) => {
    await page.goto("/genius");
    await expect(
      page.getByRole("heading", { name: "Genius Dashboard" })
    ).toBeVisible();
    // Should show connect prompt (no wallet), NOT a loading spinner
    await expect(page.getByText(/connect your wallet/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("idiot dashboard loads without infinite spinner", async ({ page }) => {
    await page.goto("/idiot");
    await expect(
      page.getByRole("heading", { name: "Idiot Dashboard" })
    ).toBeVisible();
    await expect(page.getByText(/connect your wallet/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("leaderboard page loads", async ({ page }) => {
    await page.goto("/leaderboard");
    await expect(
      page.getByRole("heading", { name: "Genius Leaderboard" })
    ).toBeVisible();
  });

  test("about page loads with content", async ({ page }) => {
    await page.goto("/about");
    const body = await page.locator("body").textContent();
    expect(body!.length).toBeGreaterThan(100);
  });

  test("signal creation page loads", async ({ page }) => {
    await page.goto("/genius/signal/new");
    await expect(page.getByText("Create Signal")).toBeVisible();
  });
});

test.describe("Live API health", () => {
  test("validator proxy returns health", async ({ request }) => {
    const res = await request.get("/api/validator/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.shares_held).toBeGreaterThanOrEqual(0);
  });

  test("app health endpoint returns ok", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("odds API returns data", async ({ request }) => {
    const res = await request.get("/api/odds?sport=basketball_nba");
    // May return empty array if no games, but should not error
    expect(res.status()).toBeLessThan(500);
  });
});
