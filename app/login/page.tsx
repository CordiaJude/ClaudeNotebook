import { Wordmark } from "@/components/brand/Mark";
import { LoginForm } from "./LoginForm";

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="ui-section" style={{ maxWidth: 420, padding: "96px 16px" }}>
      <Wordmark size={22} />
      <h1 className="ui-h1" style={{ margin: "32px 0 8px" }}>Welcome</h1>
      <p className="ui-caption" style={{ marginBottom: 24 }}>Your name is your username. Sign in with it and your password, or create an account. No email needed.</p>
      {error ? <p role="alert" style={{ color: "var(--color-danger)" }}>That sign-in link is no longer valid. Sign in with your username and password.</p> : null}
      <LoginForm next={next} />
    </main>
  );
}
