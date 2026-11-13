/**
 * Username + password accounts. Supabase Auth needs an email-shaped identifier, so the username maps to a
 * private, never-mailed address. Email confirmation must be OFF in Supabase (Authentication -> Providers -> Email).
 */
export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;
export const MIN_PASSWORD = 8;
const DOMAIN = "users.claudenotebook.app";

export const normalizeUsername = (u: string) => u.trim().toLowerCase();
export const usernameToEmail = (u: string) => `${normalizeUsername(u)}@${DOMAIN}`;

export function validateCredentials(username: string, password: string, mode: "signin" | "signup"): string | null {
  const u = normalizeUsername(username);
  if (!USERNAME_RE.test(u)) return "Username: 3-30 characters, letters, numbers, dot, dash or underscore.";
  if (mode === "signup" && password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (!password) return "Enter your password.";
  return null;
}

/** Turn Supabase auth errors into plain language. */
export function authErrorMessage(message: string, mode: "signin" | "signup"): string {
  const m = message.toLowerCase();
  if (m.includes("already registered") || m.includes("already been registered") || m.includes("user_already_exists")) return "That username is taken. Pick another, or sign in.";
  if (m.includes("invalid login") || m.includes("invalid_credentials")) return "Wrong username or password.";
  if (m.includes("email not confirmed")) return "Email confirmation is still on in Supabase. Turn it off (Authentication > Providers > Email) and try again.";
  if (m.includes("signups not allowed") || m.includes("signup_disabled")) return "New accounts are turned off in Supabase.";
  if (m.includes("rate limit")) return "Too many attempts. Wait a minute and try again.";
  if (m.includes("password") && m.includes("weak")) return "That password is too easy to guess. Use a longer one.";
  return mode === "signup" ? `Could not create the account: ${message}` : `Could not sign in: ${message}`;
}
