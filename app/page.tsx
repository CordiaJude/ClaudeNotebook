import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { Wordmark } from "@/components/brand/Mark";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const signedIn = !!(await currentUser());
  return (
    <>
      <header className="ui-section" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 72 }}>
        <Wordmark />
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <ThemeToggle />
          <Button asChild variant="secondary" size="sm"><Link href={signedIn ? "/library" : "/login"}>{signedIn ? "Open your library" : "Sign in"}</Link></Button>
        </span>
      </header>
      <main className="ui-section" style={{ padding: "96px 24px 128px" }}>
        <p className="ui-eyebrow">Docs and decks</p>
        <h1 className="ui-h-display" style={{ margin: "16px 0 24px", maxWidth: 820 }}>Say what you need. Watch the draft appear. Make it yours.</h1>
        <p style={{ fontSize: 20, lineHeight: 1.5, maxWidth: 560, color: "var(--color-text-muted)" }}>{BRAND.tagline} Ask in plain words, answer a question or two, then edit the result by hand or by asking again.</p>
        <div style={{ display: "flex", gap: 12, marginTop: 32, flexWrap: "wrap" }}>
          <Button asChild><Link href={signedIn ? "/library" : "/login"}>{signedIn ? "Open your library" : "Get started"}</Link></Button>
          <Button asChild variant="secondary"><Link href="/design">Design system</Link></Button>
        </div>
      </main>
      <footer className="ui-section ui-caption" style={{ padding: "24px 24px 48px", borderTop: "1px solid var(--color-border)" }}>© {BRAND.name}</footer>
    </>
  );
}
