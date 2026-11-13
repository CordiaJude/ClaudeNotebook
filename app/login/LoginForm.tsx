"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Segmented } from "@/components/ui/misc";
import { authErrorMessage, normalizeUsername, usernameToEmail, validateCredentials } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateCredentials(username, password, mode);
    if (problem) { setError(problem); return; }
    setBusy(true); setError("");
    const supabase = createClient();
    const name = normalizeUsername(username);
    const email = usernameToEmail(name);
    const { data, error: err } = mode === "signup"
      ? await supabase.auth.signUp({ email, password, options: { data: { name } } })
      : await supabase.auth.signInWithPassword({ email, password });
    if (err) { setError(authErrorMessage(err.message, mode)); setBusy(false); return; }
    if (mode === "signup" && !data.session) { setError("Account created but not signed in: email confirmation is still on in Supabase. Turn it off (Authentication > Providers > Email), then sign in."); setBusy(false); return; }
    const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/notebooks";
    router.replace(safe);
    router.refresh();
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12 }} noValidate>
      <Segmented label="Sign in or create an account" value={mode} onValueChange={(m) => { setMode(m); setError(""); }} options={[{ value: "signin", label: "Sign in" }, { value: "signup", label: "Create account" }]} />
      <Input aria-label="Username" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
      <Input type="password" aria-label="Password" autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder={mode === "signup" ? "Password (8+ characters)" : "Password"} value={password} onChange={(e) => setPassword(e.target.value)} />
      <Button type="submit" disabled={busy}>{busy ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}</Button>
      {error ? <p role="alert" style={{ color: "var(--cn-danger)", margin: 0 }}>{error}</p> : null}
      {mode === "signup" ? <p className="cn-caption" style={{ margin: 0 }}>There is no email on file, so a forgotten password cannot be reset. Keep it somewhere safe.</p> : null}
    </form>
  );
}
