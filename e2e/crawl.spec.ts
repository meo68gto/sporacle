import { test, expect } from "@playwright/test";

const ROUTES = [
  "/today",
  "/variance",
  "/hypotheses",
  "/health",
  "/demand",
  "/status",
  "/booking-source",
  "/occupancy",
  "/turnaway",
  "/labor",
  "/coverage",
  "/forward-book",
  "/feeds",
  "/veluma",
  "/gates",
  "/pricing",
];

test("off-allowlist email is rejected", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("nobody@example.com");
  await page.locator("button[type=submit]").click();
  await expect(page).toHaveURL(/error=forbidden/);
});

test("allowlisted admin can sign in and crawl", async ({ page }) => {
  // Crawls every route against a dev server that compiles each page on first
  // visit; the default 30s per-test budget is not enough for ~16 routes.
  test.setTimeout(240_000);
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("admin@sporacle.test");
  await page.locator("button[type=submit]").click();
  await expect(page).toHaveURL(/today/);
  for (const route of ROUTES) {
    await page.goto(route);
    const body = await page.locator("body").innerText();
    expect(body, route).not.toMatch(/\bRevenue\b/);
    expect(body, route).not.toMatch(/Total Sales/);
    expect(body, route).not.toMatch(/year-over-year|vs last year/i);
    if (route !== "/pricing" && route !== "/veluma" && route !== "/feeds" && route !== "/forward-book" && route !== "/hypotheses" && route !== "/gates") {
      const chips = page.locator("[data-provenance=true]");
      const figures = page.locator("[data-figure=true]");
      if ((await figures.count()) > 0) {
        expect(await chips.count(), route).toBeGreaterThan(0);
      }
    }
  }
  await page.goto("/pricing");
  await expect(page.locator("body")).toContainText("No elasticity estimate");
  await page.goto("/gates");
  await expect(page.locator("[data-gate]")).toHaveCount(7);
});
