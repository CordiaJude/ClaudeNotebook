import { expect, type Page } from "@playwright/test";

export async function signIn(page: Page, to = "/library") {
  await page.goto(`/login?next=${encodeURIComponent(to)}`);
  await page.getByRole("button", { name: "Use the demo account" }).click();
  await page.waitForURL((u) => u.pathname === to.split("?")[0]);
}
export const doc = (page: Page) => page.getByRole("textbox", { name: "Document" });
export const chatBox = (page: Page) => page.getByRole("textbox", { name: "Message" });

/** Open a seeded or created doc from the library by its name. */
export async function openDoc(page: Page, title: string) {
  await signIn(page);
  await page.getByRole("link", { name: new RegExp(title) }).first().click();
  await page.waitForURL(/\/a\//);
  await expect(doc(page)).toBeVisible();
}
/** A fresh blank doc, so a test never depends on what another test did. */
export async function newBlankDoc(page: Page) {
  await signIn(page);
  await page.getByRole("button", { name: /Blank doc/ }).click();
  await page.waitForURL(/\/a\//);
  await expect(doc(page)).toBeVisible();
}
/** Select the first occurrence of `text` inside the document, the way a person dragging would. */
export async function selectText(page: Page, text: string) {
  await page.evaluate((needle) => {
    const root = document.querySelector(".ui-prose")!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.textContent!.indexOf(needle);
      if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + needle.length); const s = getSelection()!; s.removeAllRanges(); s.addRange(r); (root as HTMLElement).focus(); document.dispatchEvent(new Event("selectionchange")); return; }
    }
    throw new Error(`text not found: ${needle}`);
  }, text);
}
export async function draft(page: Page, prompt: string, answer: "skip" | [string, string] = "skip") {
  await chatBox(page).fill(prompt);
  await chatBox(page).press("Enter");
  const questions = page.getByRole("form", { name: "A few questions before drafting" });
  await expect(questions).toBeVisible();
  if (answer === "skip") await page.getByRole("button", { name: "Skip, just draft" }).click();
  else { for (const a of answer) await page.getByRole("radio", { name: a }).click(); await page.getByRole("button", { name: "Start drafting" }).click(); }
}
