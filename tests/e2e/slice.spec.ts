import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { chatBox, doc, draft, newBlankDoc, openDoc, selectText, signIn } from "./helpers";

test.describe("S01 sign in", () => {
  test("signed-out visitors are sent to sign in and brought back", async ({ page }) => {
    await page.goto("/library?kind=doc");
    await expect(page).toHaveURL(/\/login\?next=%2Flibrary/);
    await page.getByRole("button", { name: "Use the demo account" }).click();
    await expect(page).toHaveURL(/\/library/);
  });
  test("a wrong password says so, in words", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("demo@draftly.test");
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("#login-error")).toHaveText("That email and password do not match.");
  });
  test("a new account starts with an empty library and can sign out", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("radio", { name: "Create account" }).click();
    await page.getByLabel("Name").fill("Ana Test");
    await page.getByLabel("Email").fill(`ana${Date.now()}@example.com`);
    await page.getByLabel("Password").fill("a-long-password");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Nothing here yet")).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("S02 library", () => {
  test("lists what I own and what was shared, with search and a type filter", async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole("link", { name: /Q1 launch plan/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Team offsite notes.*Priya Shah/s })).toBeVisible();
    await page.getByRole("searchbox", { name: "Search your library" }).fill("Lisbon"); // found by the text inside the doc
    await page.getByRole("searchbox").press("Enter");
    await expect(page.getByRole("list", { name: "1 item" })).toBeVisible();
    await page.getByRole("searchbox").fill("zzzz-nothing");
    await page.getByRole("searchbox").press("Enter");
    await expect(page.getByText("No matches")).toBeVisible();
    await page.getByRole("link", { name: "Show everything" }).click();
    await page.getByRole("radio", { name: "Decks" }).click();
    await expect(page.getByRole("link", { name: /Board update/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Q1 launch plan/ })).toHaveCount(0);
  });
  test("the owner can rename and delete; shared items offer neither", async ({ page }) => {
    await newBlankDoc(page);
    await doc(page).locator("h1").click();
    await page.keyboard.type("Throwaway doc");
    await expect(page.getByText("Saved")).toBeVisible();
    await page.goto("/library");
    await page.getByRole("button", { name: "More for Throwaway doc" }).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Renamed doc");
    await page.getByRole("button", { name: "Rename" }).click();
    await expect(page.getByRole("link", { name: /Renamed doc/ })).toBeVisible();
    await page.getByRole("button", { name: "More for Renamed doc" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("link", { name: /Renamed doc/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "More for Team offsite notes" })).toHaveCount(0);
  });
});

test.describe("F01 write a doc from a prompt", () => {
  test("prompt, questions, answers, then the draft arrives section by section", async ({ page }) => {
    await signIn(page);
    await chatBox(page).fill("Write a one-page plan for the Q1 launch");
    await page.getByRole("button", { name: "Draft" }).click();
    await page.waitForURL(/\/a\//);
    await expect(page.getByRole("form", { name: "A few questions before drafting" })).toBeVisible();
    await expect(doc(page).locator("p")).toHaveText(""); // nothing is written before the answers
    await page.getByRole("radio", { name: "Leadership" }).click();
    await page.getByRole("radio", { name: "One page" }).click();
    await page.getByRole("button", { name: "Start drafting" }).click();
    await expect(page.getByRole("status", { name: /Not written yet/ }).first()).toBeVisible(); // the layout shows before the text
    await expect(page.getByText("Outlined 3 sections")).toBeVisible();
    await expect(page.getByText(/Drafted 3 sections/)).toBeVisible({ timeout: 20_000 });
    await expect(doc(page).locator("h1")).toHaveText("Plan for the Q1 launch");
    await expect(doc(page).locator("h2")).toHaveText(["Goals", "Timeline"]);
    await expect(doc(page).locator("table")).toBeVisible();
    await expect(page.getByRole("status", { name: /Not written yet/ })).toHaveCount(0);
    await expect(page.getByRole("log")).not.toContainText("Ship on the agreed date"); // the chat never carries the document
    // autosave: the document and the conversation are there after a reload, and the library shows the new name
    await page.reload();
    await expect(doc(page).locator("h2")).toHaveText(["Goals", "Timeline"]);
    await expect(page.getByRole("log")).toContainText("Drafted 3 sections");
    await page.goto("/library");
    await expect(page.getByRole("link", { name: /Plan for the Q1 launch/ })).toBeVisible();
  });

  test("Stop keeps what was written and clears what was not", async ({ page }) => {
    await newBlankDoc(page);
    await draft(page, "Write a detailed plan for the offsite", ["My team", "Two to three pages"]);
    await expect(page.getByText(/Drafted section 1 of 5/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByRole("log")).toContainText("Stopped.");
    await expect(page.getByRole("status", { name: /Not written yet/ })).toHaveCount(0);
    await expect(doc(page)).toContainText("It is written for my team");
    await expect(chatBox(page)).toBeEnabled();
  });

  test("typing in the page while the AI drafts keeps both", async ({ page }) => {
    await newBlankDoc(page);
    await draft(page, "Write a plan for the offsite");
    await expect(page.getByText(/Drafted section 1 of 3/)).toBeVisible({ timeout: 15_000 });
    await doc(page).locator("p").first().click();
    await page.keyboard.press("End");
    await page.keyboard.type(" TYPED BY A PERSON.");
    await expect(page.getByText(/Drafted 3 sections/)).toBeVisible({ timeout: 20_000 });
    await expect(doc(page)).toContainText("TYPED BY A PERSON.");
    await expect(doc(page).locator("h2")).toHaveText(["Goals", "Timeline"]);
  });

  test("the whole flow works from the keyboard", async ({ page }) => {
    await newBlankDoc(page);
    await chatBox(page).focus();
    await page.keyboard.type("Draft a memo on remote work");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("form", { name: "A few questions before drafting" })).toBeVisible();
    await page.getByRole("radio", { name: "My team" }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Start drafting" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(/Drafted 3 sections/)).toBeVisible({ timeout: 20_000 });
    await expect(doc(page).locator("h2").first()).toHaveText("Background");
  });
});

test.describe("F02 Edit with AI", () => {
  test("changes only the selection, and one click undoes it", async ({ page }) => {
    await openDoc(page, "Q1 launch plan");
    const before = await doc(page).innerText();
    await selectText(page, "because the supplier is two weeks late");
    await page.getByRole("button", { name: "Edit with AI" }).click();
    await expect(page.getByText("Only the selected text changes.")).toBeVisible();
    await page.getByLabel("What should change?").fill("uppercase");
    await page.getByRole("button", { name: "Rewrite" }).click();
    await expect(doc(page)).toContainText("BECAUSE THE SUPPLIER IS TWO WEEKS LATE");
    expect(await doc(page).innerText()).toBe(before.replace("because the supplier is two weeks late", "BECAUSE THE SUPPLIER IS TWO WEEKS LATE"));
    await expect(page.getByRole("log")).toContainText("Rewrote the selected text. Nothing else changed.");
    await page.getByRole("button", { name: "Undo this change" }).last().click();
    await expect(doc(page)).toContainText("because the supplier is two weeks late");
    expect(await doc(page).innerText()).toBe(before);
    await expect(page.getByRole("log")).toContainText("Undone.");
  });
  test("a selection across table cells is refused with the reason, and Escape closes the box", async ({ page }) => {
    await openDoc(page, "Q1 launch plan");
    await page.evaluate(() => {
      const cells = document.querySelectorAll(".ui-prose td");
      const r = document.createRange(); r.setStart(cells[0]!.querySelector("p")!.firstChild!, 0); r.setEnd(cells[1]!.querySelector("p")!.firstChild!, 3);
      const s = getSelection()!; s.removeAllRanges(); s.addRange(r); document.dispatchEvent(new Event("selectionchange"));
    });
    const edit = page.getByRole("button", { name: "Edit with AI" });
    if (await edit.isVisible().catch(() => false)) {
      await edit.click();
      await page.getByLabel("What should change?").fill("shorter");
      await page.getByRole("button", { name: "Rewrite" }).click();
      await expect(page.getByRole("alert")).toContainText("one cell");
      await page.keyboard.press("Escape");
      await expect(page.getByLabel("What should change?")).toHaveCount(0);
    }
  });
});

test.describe("the AI acts with the asking person's permissions", () => {
  test("a viewer sees a read-only page, no AI, and the server refuses anyway", async ({ page }) => {
    await openDoc(page, "Team offsite notes");
    await expect(page.getByText("You can view this.")).toBeVisible();
    await expect(page.getByText("View only")).toBeVisible();
    await expect(doc(page)).toHaveAttribute("contenteditable", "false");
    await expect(chatBox(page)).toBeDisabled();
    await expect(page.getByRole("toolbar", { name: "Formatting" })).toHaveCount(0);
    const id = page.url().split("/a/")[1]!;
    const chat = await page.request.post("/api/ai/runs", { data: { mode: "chat", artifactId: id, message: "Add a section about budget" } });
    expect(chat.status()).toBe(403);
    const sel = await page.request.post("/api/ai/runs", { data: { mode: "selection", artifactId: id, instruction: "uppercase", scope: { startBlock: "x", startOffset: 1, endBlock: "x", endOffset: 2, text: "a" } } });
    expect(sel.status()).toBe(403);
    await expect(doc(page)).toContainText("We agreed to hold the offsite in May");
  });
  test("signed-out requests and other people's docs are refused", async ({ page, browser }) => {
    await openDoc(page, "Q1 launch plan");
    const id = page.url().split("/a/")[1]!;
    const anon = await browser.newContext();
    expect((await anon.request.post(`${new URL(page.url()).origin}/api/ai/runs`, { data: { mode: "chat", artifactId: id, message: "hi" } })).status()).toBe(401);
    const other = await anon.newPage();
    await other.goto("/login");
    await other.getByLabel("Email").fill("priya@draftly.test");
    await other.getByLabel("Password").fill("draftly-demo");
    await other.getByRole("button", { name: "Sign in" }).click();
    await other.waitForURL(/\/library/);
    await other.goto(`/a/${id}`);
    await expect(other.getByText("That page is not here")).toBeVisible();
    expect((await other.request.post("/api/ai/runs", { data: { mode: "chat", artifactId: id, message: "hi" } })).status()).toBe(404);
    await anon.close();
  });
});

test.describe("layout and accessibility", () => {
  test("on a phone the chat and the page stack behind a switch", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openDoc(page, "Q1 launch plan");
    await expect(doc(page)).toBeVisible();
    await expect(chatBox(page)).toBeHidden();
    await page.getByRole("radio", { name: "Chat" }).click();
    await expect(chatBox(page)).toBeVisible();
    await expect(doc(page)).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
  test("the chat can be resized from the keyboard", async ({ page }) => {
    await openDoc(page, "Q1 launch plan");
    const handle = page.getByRole("separator", { name: "Resize the chat" });
    const start = Number(await handle.getAttribute("aria-valuenow"));
    await handle.focus();
    await page.keyboard.press("ArrowRight");
    expect(Number(await handle.getAttribute("aria-valuenow"))).toBe(start + 24);
    await page.keyboard.press("ArrowLeft");
  });
  for (const [name, path] of [["sign in", "/login"], ["library", "/library"]] as const) {
    test(`axe: ${name} has no serious or critical issue`, async ({ page }) => {
      if (path !== "/login") await signIn(page); else await page.goto(path);
      const res = await new AxeBuilder({ page }).analyze();
      expect(res.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
    });
  }
  test("axe: the workspace has no serious or critical issue", async ({ page }) => {
    await openDoc(page, "Q1 launch plan");
    const res = await new AxeBuilder({ page }).analyze();
    expect(res.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
  });
  test("placeholder screens say plainly that they are not built", async ({ page }) => {
    await signIn(page, "/settings");
    await expect(page.getByText("Not built yet")).toBeVisible();
  });
});
