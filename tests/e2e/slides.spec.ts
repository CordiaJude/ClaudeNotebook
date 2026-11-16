import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { chatBox, signIn } from "./helpers";

const rail = (page: Page) => page.getByRole("list", { name: "Slides" });
const thumbs = (page: Page) => rail(page).getByRole("button", { name: /^Slide \d+/ });
const notes = (page: Page) => page.getByLabel("Speaker notes");

async function openBoard(page: Page) {
  await signIn(page);
  await page.getByRole("link", { name: /Board update/ }).first().click();
  await page.waitForURL(/\/a\//);
  await expect(thumbs(page).first()).toBeVisible();
}
async function blankDeck(page: Page) {
  await signIn(page);
  await page.getByRole("button", { name: /Blank deck/ }).click();
  await page.waitForURL(/\/a\//);
  await expect(page.getByText("No slides yet")).toBeVisible();
}
/** A copy of the seeded deck's first slides, built by hand in a fresh deck, so edits never leak between tests. */
async function deckWithOneSlide(page: Page) {
  await blankDeck(page);
  await page.getByRole("button", { name: "Add a slide" }).click();
  await expect(thumbs(page)).toHaveCount(1);
}

test.describe("F04 a deck from a prompt (S07)", () => {
  test("the library prompt with Slides chosen drafts a deck: questions, then slides one by one with speaker notes", async ({ page }) => {
    await signIn(page);
    await page.getByRole("radio", { name: "Slides" }).click();
    await page.getByRole("textbox", { name: "Message" }).fill("Make a deck about moving our weekly meeting to written updates");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/a\//);
    await expect(page.getByText("Who is the audience?")).toBeVisible();
    await expect(page.getByText("No slides yet")).toBeVisible(); // nothing is written before the answers
    await page.getByRole("radio", { name: "Leadership" }).click();
    await page.getByRole("radio", { name: "About 5 slides" }).click();
    await page.getByRole("button", { name: "Start drafting" }).click();
    await expect(page.getByText("Outlined 5 slides")).toBeVisible();
    await expect(thumbs(page)).toHaveCount(5);
    await expect(page.getByText(/Drafted 5 slides, each with speaker notes/)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".ui-slide-pending")).toHaveCount(0);
    await thumbs(page).nth(2).click();
    await expect(notes(page)).toHaveValue(/Pause on the number/);
    await expect(page.getByRole("group", { name: /^Slide: Average time to finish/ })).toBeVisible();
    // one click undoes the whole draft
    await page.getByRole("log").getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("No slides yet")).toBeVisible();
  });

  test("Stop keeps the slides already written and drops the ones only planned", async ({ page }) => {
    await blankDeck(page);
    await chatBox(page).fill("Make a deck about our hiring plan");
    await page.keyboard.press("Enter");
    await page.getByRole("radio", { name: "About 8 slides" }).click();
    await page.getByRole("button", { name: "Start drafting" }).click();
    await expect(page.getByText(/Drafted slide 2 of 8/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByRole("log")).toContainText("Stopped.");
    await expect(page.locator(".ui-slide-pending")).toHaveCount(0);
    const n = await thumbs(page).count();
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThan(8);
  });

  test("asking for a change adds a slide with notes and leaves the others alone", async ({ page }) => {
    await deckWithOneSlide(page);
    await page.locator(".ui-stage .ui-el").first().dblclick();
    await page.getByRole("textbox", { name: "Edit text" }).fill("Team update");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    await chatBox(page).fill("Add a slide about hiring");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Added the slide at the end, with speaker notes.")).toBeVisible({ timeout: 15_000 });
    await expect(thumbs(page)).toHaveCount(2);
    await thumbs(page).nth(1).click();
    await expect(notes(page)).toHaveValue(/hiring/);
  });
});

test.describe("S07 editing slides by hand", () => {
  test("add, retype, move and resize an element; the change is saved", async ({ page }) => {
    await deckWithOneSlide(page);
    const title = page.locator(".ui-stage .ui-el").first();
    await title.dblclick();
    await page.getByRole("textbox", { name: "Edit text" }).fill("Hand-made title");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Text: Hand-made title" })).toBeVisible();
    await expect(thumbs(page).first()).toHaveAccessibleName("Slide 1: Hand-made title");

    // drag to move: the slide itself must not jump while something is selected
    const el = page.getByRole("button", { name: "Text: Hand-made title" });
    const before = (await el.boundingBox())!;
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 24, before.y + before.height / 2 - 30, { steps: 6 });
    await page.mouse.up();
    const moved = (await el.boundingBox())!;
    expect(Math.abs(moved.x - before.x - 24)).toBeLessThanOrEqual(1);
    expect(Math.abs(moved.y - before.y + 30)).toBeLessThanOrEqual(1);
    // it cannot be dragged off the slide
    await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height / 2);
    await page.mouse.down();
    await page.mouse.move(moved.x + moved.width / 2 + 900, moved.y + moved.height / 2, { steps: 4 });
    await page.mouse.up();
    const stage = (await page.locator(".ui-stage").boundingBox())!, pinned = (await el.boundingBox())!;
    expect(pinned.x + pinned.width).toBeLessThanOrEqual(stage.x + stage.width + 1);

    // pull the right-hand handle to resize
    const handle = page.locator('.ui-el[data-state="selected"] [data-handle="e"]');
    const hb = (await handle.boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 - 120, hb.y + hb.height / 2, { steps: 6 });
    await page.mouse.up();
    const resized = (await el.boundingBox())!;
    expect(Math.abs(pinned.width - resized.width - 120)).toBeLessThanOrEqual(1);
    expect(Math.abs(resized.x - pinned.x)).toBeLessThanOrEqual(1);

    // the keyboard does the same: arrows move, Alt and arrows resize, Delete removes
    await el.focus();
    await page.keyboard.press("ArrowDown");
    const nudged = (await el.boundingBox())!;
    expect(nudged.y).toBeGreaterThan(resized.y);
    await page.keyboard.press("Alt+ArrowDown");
    expect((await el.boundingBox())!.height).toBeGreaterThan(nudged.height);

    const count = await page.locator(".ui-stage .ui-el").count();
    await page.getByRole("button", { name: "Add text" }).click();
    await expect(page.locator(".ui-stage .ui-el")).toHaveCount(count + 1);
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Text: Hand-made title" })).toBeVisible();
    const again = (await page.getByRole("button", { name: "Text: Hand-made title" }).boundingBox())!;
    expect(Math.abs(again.x - resized.x)).toBeLessThan(2);
  });

  test("text tools change the selected element only, with colours from the design system", async ({ page }) => {
    await deckWithOneSlide(page);
    const title = page.locator(".ui-stage .ui-el").first();
    await title.dblclick();
    await page.getByRole("textbox", { name: "Edit text" }).fill("Sized");
    await page.keyboard.press("Escape");
    const tools = page.getByRole("toolbar", { name: "Selected element" });
    const size = Number((await tools.locator(".ui-deck-size").textContent())!.replace(/\D/g, ""));
    await tools.getByRole("button", { name: "Larger text" }).click();
    await expect(tools.locator(".ui-deck-size")).toHaveText(`Text size ${size + 2}`);
    await tools.getByRole("button", { name: "Colour" }).click();
    await expect(page.getByText("Colours come from the design system.")).toBeVisible();
    await page.getByRole("radio", { name: "Accent", exact: true }).click();
    await expect(page.getByRole("radio", { name: "Accent", exact: true })).toBeChecked();
    await page.keyboard.press("Escape");
    // undo walks back through a person's own changes
    await page.getByRole("button", { name: "Undo", exact: true }).first().click();
    await page.getByRole("button", { name: "Undo", exact: true }).first().click();
    await page.getByRole("button", { name: "Text: Sized" }).click();
    await expect(tools.locator(".ui-deck-size")).toHaveText(`Text size ${size}`);
  });

  test("slides can be added, reordered from the keyboard, duplicated and deleted", async ({ page }) => {
    await deckWithOneSlide(page);
    await page.locator(".ui-stage .ui-el").first().dblclick();
    await page.getByRole("textbox", { name: "Edit text" }).fill("First");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Add a slide" }).click();
    await expect(thumbs(page)).toHaveCount(2);
    await page.locator(".ui-stage .ui-el").first().dblclick();
    await page.getByRole("textbox", { name: "Edit text" }).fill("Second");
    await page.keyboard.press("Escape");
    await thumbs(page).nth(1).focus();
    await page.keyboard.press("Alt+ArrowUp");
    await expect(thumbs(page).nth(0)).toHaveAccessibleName("Slide 1: Second");
    await expect(thumbs(page).nth(1)).toHaveAccessibleName("Slide 2: First");
    await page.getByRole("button", { name: "Duplicate slide" }).click();
    await expect(thumbs(page)).toHaveCount(3);
    await page.getByRole("button", { name: "Delete slide" }).click();
    await expect(thumbs(page)).toHaveCount(2);
    await notes(page).fill("Say hello first.");
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    await page.reload();
    await expect(thumbs(page)).toHaveCount(2);
  });

  test("a different layout re-lays the same words", async ({ page }) => {
    await openBoard(page);
    await thumbs(page).nth(2).click();
    await expect(page.getByRole("button", { name: "Text: What changed" })).toBeVisible();
    await expect(page.getByLabel("Layout")).toHaveValue("bullets");
  });
});

test.describe("F05 present (S08)", () => {
  test("Present fills the screen; keys move through the slides; notes can be shown; Esc returns", async ({ page }) => {
    await openBoard(page);
    await page.getByRole("button", { name: "Present" }).click();
    await page.waitForURL(/\/present/);
    await expect(page.getByRole("status")).toHaveText("Slide 1 of 4: Board update");
    await expect(page.locator(".ui-present-stage > div")).toBeVisible(); // drawn to size, so the page is live
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("status")).toHaveText(/Slide 2 of 4: Revenue growth/);
    await page.keyboard.press("n");
    await expect(page.getByLabel("Speaker notes")).toContainText("Pause on the number");
    await page.keyboard.press("End");
    await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("status")).toHaveText(/Slide 3 of 4/);
    await page.getByRole("button", { name: "Exit" }).click();
    await page.waitForURL(/\/a\/[^/]+$/);
    await expect(thumbs(page)).toHaveCount(4);
  });
});

test.describe("F08 design system (S11)", () => {
  test("an unreadable palette is refused with the reason; a good one restyles the deck; reset returns to the default", async ({ page }) => {
    await signIn(page, "/settings/design-system");
    await expect(page.getByRole("heading", { name: "Default design system" })).toBeVisible();
    await page.getByLabel("Text", { exact: true }).fill("#f0ede6");
    await expect(page.getByRole("list", { name: "Contrast checks" })).toContainText(/Text on background: 1\.\d+:1 \(needs 4\.5:1\)/);
    await page.getByRole("button", { name: "Save design system" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Text on background has a contrast of" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Default design system" })).toBeVisible(); // nothing was saved

    await page.getByLabel("Text", { exact: true }).fill("#201e1b");
    await page.getByLabel("Accent", { exact: true }).fill("#8a2d3b");
    await page.getByLabel("Heading font").selectOption("fraunces");
    await page.getByLabel("Name").fill("Burgundy");
    await page.getByRole("button", { name: "Save design system" }).click();
    await expect(page.getByText("Saved. Every deck you own now uses it.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Burgundy" })).toBeVisible();

    await page.goto("/library");
    await page.getByRole("link", { name: /Board update/ }).first().click();
    await thumbs(page).nth(1).click();
    const number = page.locator(".ui-stage-art .ui-slide > div").first();
    await expect(number).toHaveCSS("color", "rgb(138, 45, 59)");
    await expect(number).toHaveCSS("font-family", /Fraunces/);

    await page.goto("/settings/design-system");
    await page.getByRole("button", { name: "Reset to default" }).click();
    await expect(page.getByText("Back to the default design system.")).toBeVisible();
  });
});

test.describe("F07 export a deck (S10)", () => {
  test("PowerPoint, PDF and web page download with the slides and notes in them", async ({ page }) => {
    await openBoard(page);
    const get = async (label: string | RegExp) => {
      await page.getByRole("button", { name: "Export" }).click();
      const wait = page.waitForEvent("download");
      await page.getByRole("menuitem", { name: label }).click();
      const d = await wait;
      await expect(page.getByRole("menuitem", { name: label })).toContainText("Downloaded");
      await page.keyboard.press("Escape");
      return { name: d.suggestedFilename(), bytes: readFileSync((await d.path())!) };
    };
    const pptx = await get("PowerPoint (.pptx)");
    expect(pptx.name).toBe("Board update.pptx");
    expect(pptx.bytes.subarray(0, 2).toString()).toBe("PK");
    expect(pptx.bytes.length).toBeGreaterThan(20_000);
    const pdf = await get("PDF");
    expect(pdf.name).toBe("Board update.pdf");
    expect(pdf.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    const html = await get(/Web page/);
    expect(html.name).toBe("Board update.html");
    expect(html.bytes.toString()).toContain("Revenue growth on last quarter");
    expect(html.bytes.toString()).toContain("Pause on the number");
  });
});

test.describe("permissions on decks", () => {
  test("a viewer sees the deck and its notes, with no tools and no AI, and the server refuses a write anyway", async ({ page, browser }) => {
    await deckWithOneSlide(page);
    await notes(page).fill("Only the presenter sees this.");
    const id = new URL(page.url()).pathname.split("/").pop()!;
    await page.getByRole("banner").getByRole("button", { name: "Share", exact: true }).click();
    await page.getByLabel("Email address").fill("priya@draftly.test");
    await page.getByRole("dialog").getByRole("button", { name: "Share", exact: true }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Priya Shah" })).toBeVisible();

    const other = await browser.newContext();
    const p2 = await other.newPage();
    await p2.goto(`/login?next=/a/${id}`);
    await p2.getByLabel("Email").fill("priya@draftly.test");
    await p2.getByLabel("Password").fill("draftly-demo");
    await p2.getByRole("button", { name: "Sign in", exact: true }).click();
    await p2.waitForURL((u) => u.pathname.startsWith("/a/"));
    await expect(thumbs(p2)).toHaveCount(1);
    await expect(p2.getByText(/Ask the owner for edit access to change it/)).toBeVisible();
    await expect(p2.getByText("Only the presenter sees this.")).toBeVisible();
    await expect(p2.getByRole("toolbar", { name: "Slide tools" })).toHaveCount(0);
    await expect(p2.getByRole("button", { name: "Add a slide" })).toHaveCount(0);
    await expect(p2.locator(".ui-stage .ui-el")).toHaveCount(0);
    await expect(chatBox(p2)).toBeDisabled();
    const res = await p2.request.post("/api/ai/runs", { data: { artifactId: id, message: "Add a slide about hiring" } });
    expect(res.status()).toBe(403);
    await p2.getByRole("button", { name: "Present" }).click();
    await p2.waitForURL(/\/present/);
    await expect(p2.getByRole("status")).toHaveText(/Slide 1 of 1/);
    await other.close();
  });
});

test.describe("layout and accessibility", () => {
  for (const [name, go] of [["the slide editor", openBoard], ["an empty deck", blankDeck]] as const) {
    test(`axe: ${name} has no serious or critical issue`, async ({ page }) => {
      await go(page);
      const res = await new AxeBuilder({ page }).analyze();
      expect(res.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")} ${v.nodes[0]?.html.slice(0, 200)}`)).toEqual([]);
    });
  }
  test("axe: the design system page and present mode have no serious or critical issue", async ({ page }) => {
    await signIn(page, "/settings/design-system");
    let res = await new AxeBuilder({ page }).analyze();
    expect(res.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")} ${v.nodes[0]?.html.slice(0, 200)}`)).toEqual([]);
    await openBoard(page);
    await page.getByRole("button", { name: "Present" }).click();
    await page.waitForURL(/\/present/);
    await expect(page.locator(".ui-present-stage > div")).toBeVisible();
    await page.keyboard.press("n");
    await expect(page.getByLabel("Speaker notes")).toBeVisible();
    res = await new AxeBuilder({ page }).analyze();
    expect(res.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")} ${v.nodes[0]?.html.slice(0, 200)}`)).toEqual([]);
  });
  test("on a phone the rail runs along the top and the slide fits the screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openBoard(page);
    const stage = (await page.locator(".ui-stage").boundingBox())!;
    expect(stage.width).toBeLessThanOrEqual(390);
    expect(stage.x).toBeGreaterThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
