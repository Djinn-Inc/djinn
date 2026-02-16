import { test, expect } from "@playwright/test";

// Bypass beta gate by setting localStorage before each page load
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("djinn-beta-access", "true");
  });
});

test.describe("Home page", () => {
  test("renders DJINN branding and CTAs", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "DJINN" })).toBeVisible();
    await expect(page.getByText("The Genius-Idiot Network")).toBeVisible();
    await expect(page.getByText("Buy intelligence you can trust.")).toBeVisible();
    await expect(page.getByText("Sell analysis you can prove.")).toBeVisible();
  });

  test("has Genius CTA linking to /genius", async ({ page }) => {
    await page.goto("/");
    const geniusLink = page.getByRole("link", { name: /I'm a Genius/i });
    await expect(geniusLink).toBeVisible();
    await expect(geniusLink).toHaveAttribute("href", "/genius");
  });

  test("has Idiot CTA linking to /idiot", async ({ page }) => {
    await page.goto("/");
    const idiotLink = page.getByRole("link", { name: /I'm an Idiot/i });
    await expect(idiotLink).toBeVisible();
    await expect(idiotLink).toHaveAttribute("href", "/idiot");
  });

  test("has footer links", async ({ page }) => {
    await page.goto("/");
    // Footer links are <a> tags with specific hrefs
    await expect(page.locator('a[href*="github.com/djinn-inc"]').first()).toBeVisible();
    await expect(page.locator('footer a[href="/about"]')).toBeVisible();
  });

  test("Genius page loads via direct navigation", async ({ page }) => {
    await page.goto("/genius");
    await expect(page.getByRole("heading", { name: "Genius Dashboard" })).toBeVisible();
  });

  test("Idiot page loads via direct navigation", async ({ page }) => {
    await page.goto("/idiot");
    await expect(page.getByRole("heading", { name: "Idiot Dashboard" })).toBeVisible();
  });
});

test.describe("Static pages", () => {
  test("About page loads", async ({ page }) => {
    await page.goto("/about");
    // Page should load without errors (check for any visible content)
    await expect(page.locator("body")).toBeVisible();
    // Check the page has loaded (not a blank screen)
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(10);
  });

  test("Privacy page loads", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.locator("body")).toBeVisible();
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(10);
  });

  test("Terms page loads", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.locator("body")).toBeVisible();
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(10);
  });
});

test.describe("Genius dashboard (unauthenticated)", () => {
  test("shows connect wallet prompt", async ({ page }) => {
    await page.goto("/genius");
    await expect(page.getByRole("heading", { name: "Genius Dashboard" })).toBeVisible();
    await expect(
      page.getByText(/connect your wallet/i)
    ).toBeVisible();
  });
});

test.describe("Idiot dashboard (unauthenticated)", () => {
  test("shows connect wallet prompt", async ({ page }) => {
    await page.goto("/idiot");
    await expect(page.getByRole("heading", { name: "Idiot Dashboard" })).toBeVisible();
    await expect(
      page.getByText(/connect your wallet/i)
    ).toBeVisible();
  });
});
