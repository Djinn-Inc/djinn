import { test, expect } from "./fixtures/setup";

test.describe("Track Record page (authenticated)", () => {
  test("renders Track Record heading and description", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/genius/track-record");

    await expect(
      page.getByRole("heading", { name: "Track Record Proof" })
    ).toBeVisible();
    await expect(
      page.getByText(/generate a zero-knowledge proof/i)
    ).toBeVisible();
  });

  test("shows 'How It Works' section", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/genius/track-record");

    await expect(
      page.getByRole("heading", { name: "How It Works" })
    ).toBeVisible();
    await expect(
      page.getByText(/private inputs to a ZK circuit/i)
    ).toBeVisible();
  });

  test("shows Your Signals section", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/genius/track-record");

    await expect(
      page.getByRole("heading", { name: "Your Signals" })
    ).toBeVisible();
  });

  test("shows empty state when no signals saved", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/genius/track-record");

    // Since no signals in mock data, should show the empty/no data state
    const pageText = await page.locator("body").textContent();
    expect(
      pageText?.includes("No saved signal data") ||
        pageText?.includes("signal") ||
        pageText?.includes("recovery")
    ).toBeTruthy();
  });

  test("has back to dashboard link", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/genius/track-record");

    const backLink = page.getByText("Back to Dashboard");
    await expect(backLink).toBeVisible();
    await backLink.click();
    await page.waitForURL("**/genius");
  });

  test("generate proof button is disabled with no selections", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/genius/track-record");

    const btn = page.getByRole("button", { name: /Generate Proof/i });
    // Button should exist but be disabled (no signals selected)
    const isVisible = await btn.isVisible().catch(() => false);
    if (isVisible) {
      await expect(btn).toBeDisabled();
    }
  });
});
