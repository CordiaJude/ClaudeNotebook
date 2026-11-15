import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand/Mark";
import { BRAND } from "@/lib/brand";
import { DATA_MODE } from "@/lib/data";
import { DEMO } from "@/lib/data/memory";
import { currentUser } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Sign in · ${BRAND.name}` };

/** S01: sign in or create an account. Anyone opening a shared doc lands here first and is sent back after. */
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && /^\/(?!\/)/.test(sp.next) ? sp.next : "/library";
  if (await currentUser()) redirect(next);
  return (
    <main className="ui-auth">
      <Link href="/" style={{ color: "inherit", textDecoration: "none" }}><Wordmark size={22} /></Link>
      <div className="ui-card ui-auth-card">
        <div><h1 className="ui-h1" style={{ margin: 0 }}>Welcome</h1><p className="ui-caption" style={{ margin: "4px 0 0" }}>Sign in to open your docs and decks, and the ones shared with you.</p></div>
        <LoginForm next={next} demo={DATA_MODE === "demo" ? { email: DEMO.email, password: DEMO.password } : null} />
      </div>
    </main>
  );
}
