"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createArtifact } from "@/app/actions";
import { PromptBox, TemplateCard } from "@/components/doc/parts";
import type { Kind, Template } from "@/lib/data/types";

/** The hero on the library: say what you want, pick Doc or Slides, and land in the workspace with the request already sent. */
export function NewFromPrompt() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const go = (text: string, kind: Kind) => start(async () => {
    setError(null);
    const res = await createArtifact({ kind });
    if ("error" in res) { setError(res.error); return; }
    router.push(`/a/${res.id}${kind === "doc" ? `?prompt=${encodeURIComponent(text)}` : ""}`);
  });
  return (
    <div className="ui-stack">
      <PromptBox hero withOutput placeholder="What do you want to write?" sending={pending} onSubmit={go} />
      {error ? <p className="ui-error" role="alert">{error}</p> : null}
    </div>
  );
}

export function Templates({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pick = (t: Template) => start(async () => {
    setError(null);
    const res = await createArtifact({ kind: t.kind, templateId: t.id });
    if ("error" in res) { setError(res.error); return; }
    router.push(`/a/${res.id}`);
  });
  return (
    <>
      <div className="ui-lib-templates" aria-busy={pending || undefined}>
        {templates.map((t) => <div key={t.id} onClick={() => !pending && pick(t)}><TemplateCard name={t.title} blurb={t.blurb} kind={t.kind} /></div>)}
      </div>
      {error ? <p className="ui-error" role="alert">{error}</p> : null}
    </>
  );
}
