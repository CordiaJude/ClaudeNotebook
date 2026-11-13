import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { Wordmark } from "@/components/brand/Mark";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Landing() {
  let signedIn = false;
  try {
    const { data } = await (await createClient()).auth.getUser();
    signedIn = !!data.user;
  } catch { /* env not configured: show the signed-out page */ }
  return (
    <>
      <header className="cn-section" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 72 }}>
        <Wordmark />
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <ThemeToggle />
          <Button asChild variant="secondary" size="sm"><Link href={signedIn ? "/notebooks" : "/login"}>{signedIn ? "Open notebooks" : "Sign in"}</Link></Button>
        </span>
      </header>
      <main className="cn-section" style={{ padding: "96px 16px 128px" }}>
        <p className="cn-eyebrow">Docs you write with Claude</p>
        <h1 className="cn-h-display" style={{ margin: "16px 0 24px", maxWidth: 820 }}>A living document, edited by you and Claude at once.</h1>
        <p style={{ fontSize: 20, lineHeight: 1.5, maxWidth: 560, color: "var(--cn-text-secondary)" }}>{BRAND.tagline} Ask, watch each section fill in, then comment, suggest and edit alongside it.</p>
        <div style={{ display: "flex", gap: 12, marginTop: 32, flexWrap: "wrap" }}>
          <Button asChild><Link href={signedIn ? "/notebooks" : "/login"}>{signedIn ? "Open your notebooks" : "Get started"}</Link></Button>
          <Button asChild variant="secondary"><Link href="/design">Design system</Link></Button>
        </div>
      </main>
      <footer className="cn-section cn-caption" style={{ padding: "24px 16px 48px", borderTop: "1px solid var(--cn-border)" }}>{BRAND.legalLine}</footer>
    </>
  );
}
