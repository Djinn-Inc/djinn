import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("djinn-beta-access", "true");
  });
});

test.describe("Genius dashboard", () => {
  test("renders Genius Dashboard heading", async ({ page }) => {
    await page.goto("/genius");
    await expect(
      page.getByRole("heading", { name: "Genius Dashboard" })
    ).toBeVisible();
  });

  test("shows connect wallet message when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/genius");
    await expect(page.getByText(/connect your wallet/i)).toBeVisible();
  });
});

test.describe("Idiot dashboard", () => {
  test("renders Idiot Dashboard heading", async ({ page }) => {
    await page.goto("/idiot");
    await expect(
      page.getByRole("heading", { name: "Idiot Dashboard" })
    ).toBeVisible();
  });

  test("shows connect wallet message when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/idiot");
    await expect(page.getByText(/connect your wallet/i)).toBeVisible();
  });

  test("shows buyer dashboard subtitle", async ({ page }) => {
    await page.goto("/idiot");
    await expect(page.getByText(/buyer dashboard/i)).toBeVisible();
  });
});

test.describe("Signal creation", () => {
  test("renders Create Signal heading", async ({ page }) => {
    await page.goto("/genius/signal/new");
    await expect(
      page.getByRole("heading", { name: "Create Signal" })
    ).toBeVisible();
  });

  test("shows connect wallet message when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/genius/signal/new");
    await expect(page.getByText(/connect your wallet/i)).toBeVisible();
  });
});

test.describe("Track Record", () => {
  test("renders Track Record Proof heading", async ({ page }) => {
    await page.goto("/genius/track-record");
    await expect(
      page.getByRole("heading", { name: "Track Record Proof" })
    ).toBeVisible();
  });

  test("shows connect wallet message when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/genius/track-record");
    await expect(page.getByText(/connect your wallet/i)).toBeVisible();
  });
});
