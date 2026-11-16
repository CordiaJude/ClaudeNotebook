import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { doc, newBlankDoc, openDoc } from "./helpers";

async function signInAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("draftly-demo");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/library/);
}
/** A doc owned by the demo account with a known name, so tests do not disturb the seeded ones. */
async function ownDoc(page: Page, title: string) {
  await newBlankDoc(page);
  await doc(page).locator("h1").click();
  await page.keyboard.type(title);
  await page.keyboard.press("Enter");
  await page.keyboard.type("First paragraph of the shared doc.");
  await expect(page.getByText("Saved")).toBeVisible();
  return page.url();
}

test.describe("S09 share", () => {
  test("private by default; share by email; change access; remove", async ({ page, browser }) => {
    const title = `Shared doc ${Date.now()}`;
    const url = await ownDoc(page, title);
    await page.reload();
    await page.getByRole("banner").getByRole("button", { name: "Share", exact: true }).click();
    await expect(page.getByText("Private. Only the owner can open this.")).toBeVisible();

    // Priya cannot open it yet
    const other = await browser.newContext();
    const priya = await other.newPage();
    await signInAs(priya, "priya@draftly.test");
    await priya.goto(url);
    await expect(priya.getByText("That page is not here")).toBeVisible();

    // share as viewer
    await page.getByLabel("Email address").fill("priya@draftly.test");
    await page.getByRole("dialog").getByRole("button", { name: "Share", exact: true }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Priya Shah" })).toBeVisible();
    await expect(page.getByText("Shared with 1 person.")).toBeVisible();
    await priya.goto("/library");
    await expect(priya.getByRole("link", { name: new RegExp(title) })).toBeVisible();
    await priya.goto(url);
    await expect(priya.getByText("You can view this.")).toBeVisible();
    await expect(doc(priya)).toHaveAttribute("contenteditable", "false");
    await priya.getByRole("banner").getByRole("button", { name: "Share", exact: true }).click();
    await expect(priya.getByText("Only the owner can change who has access.")).toBeVisible();
    await expect(priya.getByLabel("Email address")).toHaveCount(0);
    await priya.keyboard.press("Escape");

    // raise to editor: Priya can type, and the owner sees it live
    await page.getByRole("combobox", { name: "Access for Priya Shah" }).click();
    await page.getByRole("option", { name: "Can edit" }).click();
    await expect(page.getByRole("combobox", { name: "Access for Priya Shah" })).toHaveText(/Can edit/);
    await page.keyboard.press("Escape");
    await priya.reload();
    await expect(doc(priya)).toHaveAttribute("contenteditable", "true");
    await doc(priya).locator("p").first().click();
    await priya.keyboard.press("End");
    await priya.keyboard.type(" Priya was here.");
    await expect(doc(page)).toContainText("Priya was here.");

    // an address with no account is invited
    await page.getByRole("banner").getByRole("button", { name: "Share", exact: true }).click();
    await page.getByLabel("Email address").fill("nobody-yet@example.com");
    await page.getByRole("dialog").getByRole("button", { name: "Share", exact: true }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "nobody-yet@example.com" })).toContainText("Invited");

    // remove Priya: her open page stops and says why; she can no longer open it
    await page.getByRole("combobox", { name: "Access for Priya Shah" }).click();
    await page.getByRole("option", { name: "Remove" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Priya Shah" })).toHaveCount(0);
    await expect(priya.getByText("Your access to this document was removed.")).toBeVisible({ timeout: 10_000 });
    await priya.goto(url);
    await expect(priya.getByText("That page is not here")).toBeVisible();
    await other.close();
  });

  test("a person something was shared with can leave it", async ({ page }) => {
    await openDoc(page, "Hiring plan");
    await page.getByRole("banner").getByRole("button", { name: "Share", exact: true }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Priya Shah" })).toContainText("Owner");
    await page.getByRole("button", { name: "Leave" }).click();
    await page.waitForURL(/\/library/);
    await expect(page.getByRole("link", { name: /Hiring plan/ })).toHaveCount(0);
  });
});

test.describe("S10 export", () => {
  test("Markdown, Word and PDF download with the document in them", async ({ page }) => {
    await openDoc(page, "Q1 launch plan");
    const get = async (label: string | RegExp) => {
      await page.getByRole("button", { name: "Export" }).click();
      const wait = page.waitForEvent("download");
      await page.getByRole("menuitem", { name: label }).click();
      const d = await wait;
      await expect(page.getByRole("menuitem", { name: label })).toContainText("Downloaded");
      await page.keyboard.press("Escape");
      return { name: d.suggestedFilename(), bytes: readFileSync((await d.path())!) };
    };
    const md = await get("Markdown");
    expect(md.name).toBe("Q1 launch plan.md");
    expect(md.bytes.toString()).toContain("| 20 February | Parts arrive | Priya |");
    const word = await get(/Word/);
    expect(word.name).toBe("Q1 launch plan.docx");
    expect(word.bytes.subarray(0, 2).toString()).toBe("PK");
    const pdf = await get("PDF");
    expect(pdf.name).toBe("Q1 launch plan.pdf");
    expect(pdf.bytes.subarray(0, 5).toString()).toBe("%PDF-");
  });

  test("a viewer can export; a stranger and a signed-out visitor cannot", async ({ page, browser }) => {
    await openDoc(page, "Team offsite notes");
    const id = page.url().split("/a/")[1]!;
    const ok = await page.request.post("/api/exports", { data: { artifactId: id, format: "md" } });
    expect(ok.status()).toBe(200);
    expect(await ok.text()).toContain("# Team offsite notes");
    expect((await page.request.post("/api/exports", { data: { artifactId: id, format: "exe" } })).status()).toBe(400);
    const anon = await browser.newContext();
    expect((await anon.request.post(`${new URL(page.url()).origin}/api/exports`, { data: { artifactId: id, format: "md" } })).status()).toBe(401);
    await anon.close();
    await openDoc(page, "Q1 launch plan");
    const mine = page.url().split("/a/")[1]!;
    const other = await browser.newContext();
    const priya = await other.newPage();
    await signInAs(priya, "priya@draftly.test");
    expect((await priya.request.post("/api/exports", { data: { artifactId: mine, format: "md" } })).status()).toBe(404);
    await other.close();
  });
});
