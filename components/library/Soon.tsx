import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/doc/parts";
import { Button } from "@/components/ui/button";

/** A screen that has its route and its place in the navigation, and is built in a later milestone. Says so plainly. */
export function Soon({ id, title, body, icon, milestone }: { id: string; title: string; body: string; icon: ReactNode; milestone: string }) {
  return (
    <main className="ui-lib">
      <p className="ui-eyebrow">{id} · {milestone}</p>
      <h1 className="ui-h1" style={{ margin: "4px 0 16px" }}>{title}</h1>
      <EmptyState icon={icon} title="Not built yet" body={body} action={<Button asChild variant="secondary"><Link href="/library">Back to the library</Link></Button>} />
    </main>
  );
}
