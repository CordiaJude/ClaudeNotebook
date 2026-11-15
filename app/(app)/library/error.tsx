"use client";
import { Banner } from "@/components/doc/parts";
import { Button } from "@/components/ui/button";

export default function LibraryError({ reset }: { error: Error; reset: () => void }) {
  return <main className="ui-lib"><Banner tone="error" action={<Button variant="ghost" size="sm" onClick={reset}>Try again</Button>}>Your library could not be loaded.</Banner></main>;
}
