"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const supabase = createClient();
    const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/notebooks";
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(safe)}` },
    });
    if (error) { setState("error"); setMsg(error.message); } else setState("sent");
  }

  if (state === "sent") return <p role="status">Check <strong>{email}</strong> for your sign-in link.</p>;
  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
      <Input type="email" required autoComplete="email" aria-label="Email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Button type="submit" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Email me a link"}</Button>
      {state === "error" ? <p role="alert" style={{ color: "var(--cn-danger)", margin: 0 }}>{msg}</p> : null}
    </form>
  );
}
