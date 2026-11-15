"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/brand/Mark";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const path = usePathname();
  return (
    <main className="ui-section" style={{ maxWidth: 520, padding: "96px 16px" }}>
      <Wordmark size={20} />
      <h1 className="ui-h1" style={{ margin: "32px 0 8px" }}>We couldn&apos;t find that page</h1>
      <p className="ui-caption" style={{ marginBottom: 8 }}>No page exists at <code className="ui-code">{path}</code>.</p>
      <p className="ui-caption" style={{ marginBottom: 24 }}>If you followed a link to a notebook, it may have been deleted, or you may not have access to it.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button asChild><Link href="/notebooks">Your notebooks</Link></Button>
        <Button asChild variant="secondary"><Link href="/">Home</Link></Button>
      </div>
    </main>
  );
}
