import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"] as const) {
  test(`/design axe: no serious/critical issues (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/design");
    const res = await new AxeBuilder({ page }).include(`[data-testid="pane-${theme}"]`).analyze();
    const bad = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });

  test(`/design screenshot baseline (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/design");
    await expect(page.getByTestId(`pane-${theme}`)).toHaveScreenshot(`design-${theme}.png`, { maxDiffPixelRatio: 0.01, animations: "disabled" });
  });
}

test("landing screenshot + legal line", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByText("Not affiliated with or endorsed by Anthropic")).toBeVisible();
  await expect(page).toHaveScreenshot("landing.png", { maxDiffPixelRatio: 0.01 });
});
