"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/brand/Mark";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const path = usePathname();
  return (
    <main className="ui-section" style={{ maxWidth: 520, padding: "96px 24px" }}>
      <Wordmark size={20} />
      <h1 className="ui-h1" style={{ margin: "32px 0 8px" }}>That page is not here</h1>
      <p className="ui-caption" style={{ marginBottom: 8 }}>Nothing exists at <code className="ui-code">{path}</code>.</p>
      <p className="ui-caption" style={{ marginBottom: 24 }}>If a link brought you here, the doc may have been deleted, or it is not shared with the account you are signed in with.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button asChild><Link href="/library">Your library</Link></Button>
        <Button asChild variant="secondary"><Link href="/">Home</Link></Button>
      </div>
    </main>
  );
}
