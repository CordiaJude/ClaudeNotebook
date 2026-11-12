import { Wordmark } from "@/components/brand/Mark";
import { LoginForm } from "./LoginForm";

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="cn-section" style={{ maxWidth: 420, padding: "96px 16px" }}>
      <Wordmark size={22} />
      <h1 className="cn-h1" style={{ margin: "32px 0 8px" }}>Sign in</h1>
      <p className="cn-caption" style={{ marginBottom: 24 }}>We&apos;ll email you a sign-in link. No password.</p>
      {error ? <p role="alert" style={{ color: "var(--cn-danger)" }}>That link expired or was already used. Request a new one.</p> : null}
      <LoginForm next={next} />
    </main>
  );
}
