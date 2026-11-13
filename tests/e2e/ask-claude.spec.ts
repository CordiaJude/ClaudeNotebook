import { expect, test, type Page, type Route } from "@playwright/test";

const sse = (events: object[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
const fulfill = (route: Route, events: object[]) => route.fulfill({ status: 200, headers: { "Content-Type": "text/event-stream" }, body: sse(events) });
const panel = (page: Page) => page.getByRole("region", { name: "Ask Claude" });
const box = (page: Page) => panel(page).getByRole("textbox", { name: "Message Claude" });

test.beforeEach(async ({ page }) => { await page.goto("/design/panel"); });

test("empty state offers examples (F113); clicking one fills the composer", async ({ page }) => {
  await expect(panel(page)).toContainText("This notebook is empty. What should it say?");
  await panel(page).getByRole("button", { name: "Write a one-page plan for our Q1 launch" }).click();
  await expect(box(page)).toHaveValue("Write a one-page plan for our Q1 launch");
});

test("a run streams notes and the reply; request carries context; Send disabled while empty", async ({ page }) => {
  let body: Record<string, unknown> = {};
  await page.route("**/api/agent/run", (route) => { body = route.request().postDataJSON(); return fulfill(route, [
    { type: "status", text: "Working" }, { type: "tool", name: "notebook_read", summary: "Reading (outline)" },
    { type: "section", label: "Risks" }, { type: "tool", name: "notebook_edit", summary: "Editing (1 op)" },
    { type: "text", delta: "Risks section " }, { type: "text", delta: "is filled." }, { type: "done", stopReason: "end_turn", usage: { input: 1, output: 1 } },
  ]); });
  await expect(panel(page).getByRole("button", { name: "Send" })).toBeDisabled();
  await box(page).fill("Fill the risks");
  await box(page).press("Enter");
  const log = panel(page).getByRole("log");
  await expect(log).toContainText("Fill the risks");
  await expect(log).toContainText("· Reading (outline)");
  await expect(log).toContainText("· Editing (1 op)");
  await expect(log).toContainText("Risks section is filled.");
  expect(body).toMatchObject({ message: "Fill the risks", notebookId: "nb-test", tabId: "t1", trigger: "panel" });
  await expect(box(page)).toHaveValue("");
});

test("Stop aborts the run and says so", async ({ page }) => {
  await page.route("**/api/agent/run", () => new Promise(() => {})); // never answers
  await box(page).fill("Write something long");
  await panel(page).getByRole("button", { name: "Send" }).click();
  await expect(panel(page).getByRole("button", { name: /Stop/ })).toBeVisible();
  await panel(page).getByRole("button", { name: /Stop/ }).click();
  await expect(panel(page).getByRole("log")).toContainText("· Stopped.");
  await expect(panel(page).getByRole("button", { name: /Stop/ })).toHaveCount(0);
});

test("not configured / daily cap / server errors show a clear message and the app keeps working", async ({ page }) => {
  for (const [status, message] of [[503, "AI is not configured."], [429, "You have reached today's limit for Ask Claude. It resets at midnight UTC."]] as const) {
    await page.unroute("**/api/agent/run").catch(() => {});
    await page.route("**/api/agent/run", (route) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ code: "x", message }) }));
    await box(page).fill(`try ${status}`);
    await box(page).press("Enter");
    await expect(panel(page).getByRole("alert").filter({ hasText: message })).toBeVisible();
  }
});

test("selection hand-off: the toolbar event quotes the selection and the run is a selection trigger", async ({ page }) => {
  let body: Record<string, unknown> = {};
  await page.route("**/api/agent/run", (route) => { body = route.request().postDataJSON(); return fulfill(route, [{ type: "done", stopReason: "end_turn", usage: { input: 0, output: 0 } }]); });
  await expect(async () => { // retry until React has hydrated and the listener is attached
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("cn:ask-claude", { detail: { text: "tighten these words" } })));
    await expect(panel(page)).toContainText("About this selection", { timeout: 500 });
  }).toPass();
  await expect(panel(page)).toContainText("tighten these words");
  await box(page).fill("Tighten this");
  await box(page).press("Enter");
  await expect.poll(() => body.selection).toBe("tighten these words");
  expect(body.trigger).toBe("selection");
});

test("Cmd/Ctrl+Shift+K focuses the composer", async ({ page }) => {
  await page.locator("body").click();
  await page.keyboard.press("Control+Shift+K");
  await expect(box(page)).toBeFocused();
});

test("birth flow: the notebooks-list prompt navigates into the new notebook as soon as it is created", async ({ page }) => {
  await page.route("**/api/agent/run", (route) => fulfill(route, [{ type: "status", text: "Working" }, { type: "tool", name: "notebook_create", summary: "Creating the notebook" }, { type: "created", notebookId: "nb-new-123", tabId: "t9" }]));
  await page.getByRole("textbox", { name: "What should Claude write?" }).fill("Write a one-page plan for Q1");
  await page.getByRole("button", { name: "Write it" }).click();
  await expect(page).toHaveURL(/nb-new-123/); // (unauthenticated here, so the proxy adds /login?next=…; the navigation happened)
});
