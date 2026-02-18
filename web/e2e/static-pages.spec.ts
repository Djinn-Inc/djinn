import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("djinn-beta-access", "true");
  });
});

test.describe("About page", () => {
  test("renders about content", async ({ page }) => {
    await page.goto("/about");
    const body = await page.locator("body").textContent();
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(100);
  });
});

test.describe("Privacy page", () => {
  test("renders privacy content", async ({ page }) => {
    await page.goto("/privacy");
    const body = await page.locator("body").textContent();
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(100);
  });
});

test.describe("Terms page", () => {
  test("renders terms content", async ({ page }) => {
    await page.goto("/terms");
    const body = await page.locator("body").textContent();
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(100);
  });
});

test.describe("Press page", () => {
  test("renders press content", async ({ page }) => {
    await page.goto("/press");
    const body = await page.locator("body").textContent();
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(50);
  });
});

test.describe("Health endpoint", () => {
  test("returns 200 with status ok", async ({ request }) => {
    const resp = await request.get("/api/health");
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json.status).toBe("ok");
  });
});

test.describe("404 handling", () => {
  test("nonexistent page shows not found", async ({ page }) => {
    const resp = await page.goto("/this-page-does-not-exist-at-all");
    expect(resp?.status()).toBe(404);
  });
});
