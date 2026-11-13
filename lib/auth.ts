/**
 * Name + password accounts. The "username" is the person's name exactly as they type it ("Jude Cordia"); it is what
 * bylines, mentions and presence show. Supabase Auth needs an email-shaped identifier, so a normalized form of the
 * name maps to a private, never-mailed address (case and spacing ignored when signing in).
 * Email confirmation must be OFF in Supabase (Authentication -> Providers -> Email).
 */
export const MIN_PASSWORD = 8;
export const MAX_NAME = 40;
const DOMAIN = "users.claudenotebook.app";

/** The name as it will be displayed: trimmed, inner whitespace collapsed, case kept. */
export const displayName = (u: string) => u.normalize("NFC").replace(/\s+/g, " ").trim();

/** Letters (any language), numbers, spaces and . _ - ' only; 3-40 characters; at least 3 letters or digits. */
const ALLOWED = /^[\p{L}\p{N} ._'’-]+$/u;
const countAlnum = (s: string) => (s.match(/[\p{L}\p{N}]/gu) ?? []).length;

/** Stable identity key: case-insensitive, spaces -> dots, anything outside [a-z0-9._-] encoded so different names never collide. */
export function nameKey(u: string): string {
  return [...displayName(u).toLowerCase().replace(/ /g, ".")]
    .map((c) => (/[a-z0-9._-]/.test(c) ? c : `_u${c.codePointAt(0)!.toString(16)}_`))
    .join("");
}
export const usernameToEmail = (u: string) => `${nameKey(u)}@${DOMAIN}`;

export function validateCredentials(username: string, password: string, mode: "signin" | "signup"): string | null {
  const n = displayName(username);
  if (n.length < 3 || n.length > MAX_NAME || !ALLOWED.test(n) || countAlnum(n) < 3) return `Name: ${3}-${MAX_NAME} characters (letters, numbers, spaces, . _ - ').`;
  if (mode === "signup" && password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (!password) return "Enter your password.";
  return null;
}

/** Turn Supabase auth errors into plain language. */
export function authErrorMessage(message: string, mode: "signin" | "signup"): string {
  const m = message.toLowerCase();
  if (m.includes("already registered") || m.includes("already been registered") || m.includes("user_already_exists")) return "Someone already uses that name. Add a middle initial or a number, or sign in.";
  if (m.includes("invalid login") || m.includes("invalid_credentials")) return "Wrong name or password.";
  if (m.includes("email not confirmed")) return "Email confirmation is still on in Supabase. Turn it off (Authentication > Providers > Email) and try again.";
  if (m.includes("signups not allowed") || m.includes("signup_disabled")) return "New accounts are turned off in Supabase.";
  if (m.includes("rate limit")) return "Too many attempts. Wait a minute and try again.";
  if (m.includes("password") && m.includes("weak")) return "That password is too easy to guess. Use a longer one.";
  return mode === "signup" ? `Could not create the account: ${message}` : `Could not sign in: ${message}`;
}
