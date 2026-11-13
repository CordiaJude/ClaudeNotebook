import { describe, expect, it } from "vitest";
import { authErrorMessage, usernameToEmail, validateCredentials } from "@/lib/auth";

describe("username + password accounts", () => {
  it("maps a username to a stable private email, case-insensitively", () => {
    expect(usernameToEmail(" Ada.L ")).toBe("ada.l@users.claudenotebook.app");
    expect(usernameToEmail("ada.l")).toBe(usernameToEmail("ADA.L"));
  });
  it("validates usernames and password length", () => {
    expect(validateCredentials("ab", "x", "signin")).toMatch(/Username/);
    expect(validateCredentials("has space", "longenough", "signup")).toMatch(/Username/);
    expect(validateCredentials("a@b.com", "longenough", "signup")).toMatch(/Username/);
    expect(validateCredentials("-bad", "longenough", "signup")).toMatch(/Username/);
    expect(validateCredentials("ada", "short", "signup")).toMatch(/at least 8/);
    expect(validateCredentials("ada", "short", "signin")).toBeNull(); // existing accounts may predate the rule
    expect(validateCredentials("ada_l-1.x", "longenough", "signup")).toBeNull();
    expect(validateCredentials("ada", "", "signin")).toMatch(/password/i);
  });
  it("explains Supabase errors in plain language", () => {
    expect(authErrorMessage("User already registered", "signup")).toMatch(/taken/);
    expect(authErrorMessage("Invalid login credentials", "signin")).toBe("Wrong username or password.");
    expect(authErrorMessage("Email not confirmed", "signin")).toMatch(/Turn it off/);
    expect(authErrorMessage("Signups not allowed for this instance", "signup")).toMatch(/turned off/);
    expect(authErrorMessage("boom", "signup")).toContain("boom");
  });
});
