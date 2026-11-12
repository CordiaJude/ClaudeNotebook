import { expect, test, type Page } from "@playwright/test";

const BYLINE = { type: "byline", attrs: { asof: "2026-11-12", authorId: "u-test", authorName: "Test Author" } };
const open = async (page: Page, body: unknown[] = [{ type: "paragraph" }]) => {
  await page.goto("/design/editor");
  await page.locator(".cn-prose").waitFor();
  await page.evaluate(([b, by]) => (window as any).__editor.commands.setContent({ type: "doc", content: [{ type: "title", content: [{ type: "text", text: "Doc" }] }, by, ...(b as any[])] }), [body, BYLINE] as const);
  await page.locator(".cn-prose > p:last-child, .cn-prose > :last-child").last().click();
};
const ed = (page: Page) => page.locator(".cn-prose");
const names = (page: Page) => page.evaluate(() => { const n: string[] = []; (window as any).__editor.state.doc.forEach((x: any) => n.push(x.type.name)); return n; });

test("F05: title + byline (date chip · author chip), nothing else on the line", async ({ page }) => {
  await open(page);
  await expect(ed(page).locator("h1[data-title]")).toHaveText("Doc");
  const by = ed(page).locator(".cn-byline");
  await expect(by).toHaveText("2026-11-12 · @Test Author");
  await expect(by.locator(".cn-chip")).toHaveCount(2);
});

test("invariants: select-all + delete keeps title, byline, one block", async ({ page }) => {
  await open(page, [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }]);
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  const n = await names(page);
  expect(n.slice(0, 2)).toEqual(["title", "byline"]);
  expect(n.length).toBeGreaterThanOrEqual(3);
  await expect(ed(page).locator(".cn-byline")).toContainText("@Test Author"); // refilled by the plugin
});

test("invariants: Backspace at the start of the body does not delete the byline", async ({ page }) => {
  await open(page, [{ type: "paragraph" }]);
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  expect((await names(page)).slice(0, 2)).toEqual(["title", "byline"]);
});

test("invariants: only one title can exist; Enter in the title jumps to the body", async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).__editor.chain().focus("end").insertContent({ type: "title", content: [{ type: "text", text: "second" }] }).run());
  expect((await names(page)).filter((x) => x === "title")).toHaveLength(1);
  await page.locator("h1[data-title]").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("body text");
  await expect(ed(page).locator("p").last()).toContainText("body text");
  expect((await names(page)).filter((x) => x === "title")).toHaveLength(1);
});

test("F30: mention chip (person) via slash picker", async ({ page }) => {
  await open(page);
  await page.keyboard.type("/mention");
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").getByRole("button", { name: "Priya" }).click();
  await expect(ed(page).locator('[data-kind="user"]')).toHaveText("@Priya");
});

test("F04/F30: tab link chip opens that tab; notebook chip exists", async ({ page }) => {
  await open(page);
  await page.keyboard.type("/link");
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").getByRole("button", { name: "Sources" }).click();
  const chip = ed(page).locator('[data-kind="tab"]');
  await expect(chip).toContainText("Sources");
  await chip.click();
  expect(await page.evaluate(() => (window as any).__opened)).toBe("t2");
  await ed(page).locator("p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" /link");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").getByRole("button", { name: "Other notebook" }).click();
  await expect(ed(page).locator('[data-kind="notebook"]')).toContainText("Other notebook");
});

test("F30: date chip is editable", async ({ page }) => {
  await open(page);
  await page.keyboard.type("/date");
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").getByLabel("Date").fill("2026-12-01");
  await page.getByRole("button", { name: "Insert date" }).click();
  const chip = ed(page).locator("button.cn-chip", { hasText: "2026-12-01" });
  await expect(chip).toBeVisible();
  await chip.click();
  await page.getByRole("textbox", { name: "Date" }).fill("2027-01-15");
  await expect(ed(page).locator("button.cn-chip", { hasText: "2027-01-15" })).toBeVisible();
});

test("F23/F30/F31: dropdown chip in a table cell; value stored as enumId + index; removed options hidden", async ({ page }) => {
  await open(page, [
    { type: "table", content: [
      { type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Risk" }] }] }, { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Status" }] }] }] },
      { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Vendor" }] }] }, { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "dropdownChip", attrs: { enumId: "e-status", index: 0 } }] }] }] },
    ] },
  ]);
  const chip = ed(page).locator("td button.cn-chip");
  await expect(chip).toContainText("On track");
  await chip.click();
  const opts = page.getByRole("menuitem");
  await expect(opts).toHaveText(["On track", "At risk", "Blocked"]); // "Old" is removed -> hidden
  await opts.nth(2).click();
  await expect(chip).toContainText("Blocked");
  const attrs = await page.evaluate(() => { let a: any; (window as any).__editor.state.doc.descendants((n: any) => { if (n.type.name === "dropdownChip") a = n.attrs; }); return a; });
  expect(attrs).toEqual({ enumId: "e-status", index: 2 });
});

test("F31: dropdown chip pointing at a removed option still shows its value", async ({ page }) => {
  await open(page, [{ type: "paragraph", content: [{ type: "dropdownChip", attrs: { enumId: "e-status", index: 3 } }] }]);
  await expect(ed(page).locator("button.cn-chip")).toContainText("Old (removed)");
});

test("F40: pending block shows intent as a skeleton; a human can delete it", async ({ page }) => {
  await open(page, [{ type: "pending", attrs: { intent: "Risks: what could slip and the fallback" } }, { type: "paragraph" }]);
  const pb = ed(page).locator(".cn-pending");
  await expect(pb).toBeVisible();
  await expect(pb).toContainText("Risks: what could slip and the fallback");
  await expect(pb).toHaveCSS("border-top-style", "dashed");
  await page.evaluate(() => { const e = (window as any).__editor; let pos = -1; e.state.doc.descendants((n: any, p: number) => { if (n.type.name === "pending") pos = p; }); e.chain().focus().setNodeSelection(pos).deleteSelection().run(); });
  await expect(pb).toHaveCount(0);
  expect((await names(page)).includes("pending")).toBe(false);
});

test("embed block: caption is editable and stored", async ({ page }) => {
  await open(page, [{ type: "embed", attrs: { widgetId: "w1", caption: "" } }, { type: "paragraph" }]);
  await ed(page).getByLabel("Caption").fill("Source: finance export");
  await ed(page).getByLabel("Caption").blur();
  const cap = await page.evaluate(() => { let c = ""; (window as any).__editor.state.doc.descendants((n: any) => { if (n.type.name === "embed") c = n.attrs.caption; }); return c; });
  expect(cap).toBe("Source: finance export");
});

test("every new block type gets a stable id", async ({ page }) => {
  await open(page, [{ type: "pending", attrs: { intent: "x" } }, { type: "embed", attrs: { widgetId: "w", caption: "" } }, { type: "paragraph" }]);
  const ids = await page.evaluate(() => { const r: Record<string, string> = {}; (window as any).__editor.state.doc.descendants((n: any) => { if (["title", "byline", "pending", "embed"].includes(n.type.name)) r[n.type.name] = n.attrs.id; }); return r; });
  for (const k of ["title", "byline", "pending", "embed"]) expect(ids[k]?.length).toBeGreaterThan(5);
});
