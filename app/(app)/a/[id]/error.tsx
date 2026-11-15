"use client";
import Link from "next/link";
import { Banner } from "@/components/doc/parts";
import { Button } from "@/components/ui/button";

export default function WorkspaceError({ reset }: { error: Error; reset: () => void }) {
  return <main className="ui-lib"><Banner tone="error" action={<><Button variant="ghost" size="sm" onClick={reset}>Try again</Button><Button asChild variant="ghost" size="sm"><Link href="/library">Library</Link></Button></>}>This could not be opened.</Banner></main>;
}
