import { expect, test } from "@playwright/test";
test("home loads with legal line", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Not affiliated with or endorsed by Anthropic")).toBeVisible();
});
