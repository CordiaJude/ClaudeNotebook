import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => { await page.goto("/login"); });

test("sign in / create account toggle; validation happens before any request", async ({ page }) => {
  let calls = 0;
  await page.route("**/auth/v1/**", (r) => { calls++; return r.abort(); });
  await expect(page.getByRole("button", { name: "Sign in" }).last()).toBeVisible();
  await page.getByRole("radio", { name: "Create account" }).click();
  await expect(page.getByPlaceholder("Password (8+ characters)")).toBeVisible();
  await page.getByLabel("Username").fill("ab");
  await page.getByLabel("Password").fill("whatever1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Username");
  await page.getByLabel("Username").fill("ada");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("at least 8");
  expect(calls).toBe(0);
});

test("sign-up sends the private email, stores the username as the name, and shows a friendly error", async ({ page }) => {
  let body: Record<string, any> = {};
  await page.route("**/auth/v1/signup**", (r) => { body = r.request().postDataJSON(); return r.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ code: "user_already_exists", msg: "User already registered" }) }); });
  await page.getByRole("radio", { name: "Create account" }).click();
  await page.getByLabel("Username").fill("Ada.L");
  await page.getByLabel("Password").fill("correct horse");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("That username is taken");
  expect(body.email).toBe("ada.l@users.claudenotebook.app");
  expect(body.data).toMatchObject({ name: "ada.l" });
});

test("wrong password gets a plain message", async ({ page }) => {
  await page.route("**/auth/v1/token**", (r) => r.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error_code: "invalid_credentials", msg: "Invalid login credentials" }) }));
  await page.getByLabel("Username").fill("ada");
  await page.getByLabel("Password").fill("nope nope nope");
  await page.getByRole("button", { name: "Sign in" }).last().click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Wrong username or password.");
});
