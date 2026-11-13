import { describe, expect, it } from "vitest";
import { authErrorMessage, displayName, nameKey, usernameToEmail, validateCredentials } from "@/lib/auth";

describe("name + password accounts", () => {
  it("keeps the name exactly as typed for display (case and inner spacing normalized only)", () => {
    expect(displayName("  Jude   Cordia ")).toBe("Jude Cordia");
    expect(displayName("María José")).toBe("María José");
  });
  it("signs in case- and spacing-insensitively: same person, same private email", () => {
    expect(usernameToEmail("Jude Cordia")).toBe("jude.cordia@users.claudenotebook.app");
    expect(usernameToEmail("  jude   CORDIA ")).toBe(usernameToEmail("Jude Cordia"));
  });
  it("different names never collide, including non-Latin and accented ones", () => {
    const keys = ["Jude Cordia", "Jude.Cordia2", "María", "Maria", "Zoë", "Zoe", "李雷", "韩梅梅"].map(nameKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z0-9._\-_u]+$/);
    expect(usernameToEmail("李雷")).toMatch(/^[a-z0-9._-]+@users\.claudenotebook\.app$/);
  });
  it("validates names and password length", () => {
    expect(validateCredentials("ab", "x", "signin")).toMatch(/Name/);
    expect(validateCredentials("a@b.com", "longenough", "signup")).toMatch(/Name/);
    expect(validateCredentials("<script>", "longenough", "signup")).toMatch(/Name/);
    expect(validateCredentials("...", "longenough", "signup")).toMatch(/Name/);
    expect(validateCredentials("x".repeat(41), "longenough", "signup")).toMatch(/Name/);
    expect(validateCredentials("Jude Cordia", "short", "signup")).toMatch(/at least 8/);
    expect(validateCredentials("Jude Cordia", "short", "signin")).toBeNull();
    expect(validateCredentials("O'Brien-Smith Jr.", "longenough", "signup")).toBeNull();
    expect(validateCredentials("李雷", "longenough", "signup")).toMatch(/Name/); // only 2 letters
    expect(validateCredentials("韩梅梅", "longenough", "signup")).toBeNull();
    expect(validateCredentials("Jude", "", "signin")).toMatch(/password/i);
  });
  it("explains Supabase errors in plain language", () => {
    expect(authErrorMessage("User already registered", "signup")).toMatch(/already uses that name/);
    expect(authErrorMessage("Invalid login credentials", "signin")).toBe("Wrong name or password.");
    expect(authErrorMessage("Email not confirmed", "signin")).toMatch(/Turn it off/);
    expect(authErrorMessage("boom", "signup")).toContain("boom");
  });
});
