import { expect, test } from "@playwright/test";
test("home loads with the product name and no other company's name", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Draftly").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/claude|anthropic/i);
});
