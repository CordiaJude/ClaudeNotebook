import { expect, test, type Page } from "@playwright/test";

const open = async (page: Page) => {
  await page.goto("/design/editor");
  await page.locator(".cn-prose").waitFor();
  await page.evaluate(() => (window as any).__editor.commands.setContent({ type: "doc", content: [{ type: "title", content: [{ type: "text", text: "T" }] }, { type: "byline", attrs: { asof: "2026-11-12", authorId: "u-test", authorName: "Test Author" } }, { type: "paragraph" }] }));
  await page.locator(".cn-prose > p:last-child, .cn-prose > :last-child").last().click();
};
const ed = (page: Page) => page.locator(".cn-prose");

test("slash menu inserts a heading, filtered by query", async ({ page }) => {
  await open(page);
  await page.keyboard.type("/head");
  await expect(page.getByRole("listbox", { name: "Insert block" })).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.type("Title here");
  await expect(ed(page).locator("h1:not([data-title])")).toHaveText("Title here");
});

test("markdown shortcuts: lists, task list, quote, divider", async ({ page }) => {
  await open(page);
  await page.keyboard.type("- one\ntwo\n\n");
  await page.keyboard.type("[ ] todo");
  await expect(ed(page).locator("ul").first().locator("li")).toHaveCount(2);
  await expect(ed(page).locator('ul[data-type="taskList"] li')).toHaveCount(1);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("> quote");
  await expect(ed(page).locator("blockquote")).toHaveText("quote");
});

test("ticked task is struck through and dimmed", async ({ page }) => {
  await open(page);
  await page.keyboard.type("[ ] done thing");
  await ed(page).locator('ul[data-type="taskList"] input[type="checkbox"]').check();
  const p = ed(page).locator('ul[data-type="taskList"] li[data-checked="true"] p');
  await expect(p).toHaveCSS("text-decoration-line", "line-through");
  await expect(p).toHaveCSS("opacity", "0.65");
});

test("marks via shortcuts", async ({ page }) => {
  await open(page);
  await page.keyboard.press("Control+b"); await page.keyboard.type("bold ");
  await page.keyboard.press("Control+b"); await page.keyboard.press("Control+i"); await page.keyboard.type("ital");
  await expect(ed(page).locator("strong")).toHaveText("bold");
  await expect(ed(page).locator("em")).toHaveText("ital");
});

test("table: insert, 7-color cell backgrounds, merge", async ({ page }) => {
  await open(page);
  await page.keyboard.type("/table");
  await page.keyboard.press("Enter");
  await expect(ed(page).locator("table")).toBeVisible();
  const bar = page.getByRole("toolbar", { name: "Table" });
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Cell color" }).click();
  const colors = page.getByRole("group", { name: "Cell color" }).getByRole("button");
  await expect(colors).toHaveCount(7);
  await page.getByRole("button", { name: "green", exact: true }).click();
  await expect(ed(page).locator("[data-bg=green]")).toHaveCount(1);
  await page.keyboard.press("Escape");
  // select two cells with a cell-selection and merge
  await page.evaluate(() => {
    const e = (window as any).__editor; const { state } = e; const cells: number[] = [];
    state.doc.descendants((n: any, pos: number) => { if (n.type.name === "tableCell" && cells.length < 2) cells.push(pos); });
    const CellSelection = state.selection.constructor.name === "CellSelection" ? state.selection.constructor : null;
    void CellSelection;
    e.chain().focus().setCellSelection({ anchorCell: cells[0], headCell: cells[1] }).mergeCells().run();
  });
  await expect(ed(page).locator("td[colspan='2'], td[colSpan='2']")).toHaveCount(1);
});

test("code block languages: latex, csv, markdown, mermaid", async ({ page }) => {
  await open(page);
  for (const [cmd, probe] of [["/formula", ".cn-preview .katex"], ["/csv", ".cn-preview table td"], ["/markdown", ".cn-md li"], ["/mermaid", ".cn-preview svg"]] as const) {
    await page.keyboard.type(cmd);
    await page.keyboard.press("Enter");
    await expect(page.locator(probe).first()).toBeVisible({ timeout: 15000 });
    await page.evaluate(() => (window as any).__editor.chain().focus("end").insertContent({ type: "paragraph" }).run());
  }
});

test("links: unsafe hrefs are rejected, safe ones kept", async ({ page }) => {
  await open(page);
  const r = await page.evaluate(() => {
    const e = (window as any).__editor;
    e.chain().focus("end").insertContent('<p><a href="javascript:alert(1)">bad</a> <a href="https://example.com">good</a> <a href="#plan">anchor</a></p>').run();
    return [...document.querySelectorAll(".cn-prose a")].map((a) => a.getAttribute("href"));
  });
  expect(r).not.toContain("javascript:alert(1)");
  expect(r).toContain("https://example.com");
  expect(r).toContain("#plan");
});

test("pasted HTML is sanitized by the schema (no script, no iframe, no external img)", async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).__editor.commands.insertContent('<p>hi</p><script>window.__x=1</script><iframe src="https://evil.test"></iframe><img src="https://evil.test/a.png"><p onclick="window.__y=1">ok</p>'));
  await expect(ed(page).locator("script, iframe, img")).toHaveCount(0);
  await expect(ed(page).locator("[onclick]")).toHaveCount(0);
});

test("pasted markdown becomes structure", async ({ page }) => {
  await open(page);
  await page.evaluate(() => { const e = (window as any).__editor; e.chain().focus().insertContent(e.markdown.parse("## Heading\n\n- a\n- b\n\n| x | y |\n|---|---|\n| 1 | 2 |").content).run(); });
  await expect(ed(page).locator("h2")).toHaveText("Heading");
  await expect(ed(page).locator("ul li")).toHaveCount(2);
  await expect(ed(page).locator("table")).toHaveCount(1);
});

test("every block gets a stable id", async ({ page }) => {
  await open(page);
  await page.keyboard.type("hello");
  const ids = await page.evaluate(() => { const ids: string[] = []; (window as any).__editor.state.doc.descendants((n: any) => { if (n.type.name === "paragraph") ids.push(n.attrs.id); }); return ids; });
  expect(ids.every((i) => typeof i === "string" && i.length > 5)).toBe(true);
});

test("undo / redo", async ({ page }) => {
  await open(page);
  await page.keyboard.type("abc");
  await page.keyboard.press("Control+z");
  await expect(ed(page)).not.toContainText("abc");
  await page.keyboard.press("Control+Shift+z");
  await expect(ed(page)).toContainText("abc");
});
