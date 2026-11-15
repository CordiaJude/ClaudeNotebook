"use client";
import { useActionState, useState } from "react";
import { signIn, signUp, type FormState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Segmented } from "@/components/ui/misc";

export function LoginForm({ next, demo }: { next: string; demo: { email: string; password: string } | null }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [inState, inAction, inPending] = useActionState<FormState, FormData>(signIn, null);
  const [upState, upAction, upPending] = useActionState<FormState, FormData>(signUp, null);
  const error = mode === "in" ? inState?.error : upState?.error;
  const pending = inPending || upPending;
  return (
    <div className="ui-stack">
      <Segmented label="Sign in or create an account" value={mode} onValueChange={setMode} options={[{ value: "in", label: "Sign in" }, { value: "up", label: "Create account" }]} />
      <form action={mode === "in" ? inAction : upAction} className="ui-stack" noValidate>
        <input type="hidden" name="next" value={next} />
        {mode === "up" ? <label className="ui-form-row"><span className="ui-label">Name</span><Input name="name" autoComplete="name" required maxLength={80} /></label> : null}
        <label className="ui-form-row"><span className="ui-label">Email</span><Input name="email" type="email" autoComplete="email" required aria-invalid={error ? true : undefined} aria-describedby={error ? "login-error" : undefined} /></label>
        <label className="ui-form-row"><span className="ui-label">Password</span><Input name="password" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} required minLength={8} aria-describedby={mode === "up" ? "pw-hint" : undefined} /></label>
        {mode === "up" ? <p className="ui-hint" id="pw-hint">At least 8 characters.</p> : null}
        {error ? <p className="ui-error" id="login-error" role="alert">{error}</p> : null}
        <Button type="submit" size="lg" loading={pending}>{mode === "in" ? "Sign in" : "Create account"}</Button>
      </form>
      <div className="ui-or" role="separator"><span>or</span></div>
      <Button variant="secondary" size="lg" disabled title="Google sign-in is switched on in the backend step">Continue with Google</Button>
      <p className="ui-hint">Google sign-in is switched on when the real accounts are connected.</p>
      {demo ? (
        <form action={inAction} className="ui-banner" style={{ alignItems: "center" }}>
          <input type="hidden" name="next" value={next} /><input type="hidden" name="email" value={demo.email} /><input type="hidden" name="password" value={demo.password} />
          <span style={{ flex: 1 }}>Demo mode: nothing is saved after a restart. Account <strong>{demo.email}</strong>, password <strong>{demo.password}</strong>.</span>
          <Button type="submit" variant="secondary" size="sm" loading={inPending}>Use the demo account</Button>
        </form>
      ) : null}
    </div>
  );
}
