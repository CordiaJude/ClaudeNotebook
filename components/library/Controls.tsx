"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteArtifact, renameArtifact } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { IconSearch } from "@/components/ui/icons";
import { Segmented } from "@/components/ui/misc";
import { ControlledDialog, Menu } from "@/components/ui/overlays";

type Filter = "all" | "doc" | "deck";
/** Search and the type filter. Both live in the address, so a filtered library can be linked and reloaded. */
export function LibraryFilters({ q, kind }: { q: string; kind: Filter }) {
  const router = useRouter(), path = usePathname(), params = useSearchParams();
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v && v !== "all") next.set(k, v); else next.delete(k); }
    router.replace(`${path}${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  return (
    <div className="ui-lib-filters">
      <form role="search" className="ui-lib-search" onSubmit={(e) => { e.preventDefault(); set({ q: String(new FormData(e.currentTarget).get("q") ?? "").trim() }); }}>
        <IconSearch />
        <Input name="q" type="search" aria-label="Search your library" placeholder="Search" defaultValue={q} key={q} />
      </form>
      <Segmented<Filter> label="Type" value={kind} onValueChange={(v) => set({ kind: v })} options={[{ value: "all", label: "All" }, { value: "doc", label: "Docs" }, { value: "deck", label: "Decks" }]} />
    </div>
  );
}

/** Rename and delete, shown only to the owner (the server refuses anyone else regardless). */
export function CardMenu({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const close = () => { setDialog(null); setError(null); };
  const done = (res: { error?: string } | null) => { if (res?.error) setError(res.error); else { close(); router.refresh(); } };
  return (
    <>
      <Menu trigger={<button className="ui-btn ui-btn--ghost ui-btn--icon ui-lib-more" aria-label={`More for ${title}`}>⋯</button>} items={[{ label: "Rename", onSelect: () => setDialog("rename") }, "sep", { label: "Delete", onSelect: () => setDialog("delete") }]} />
      <ControlledDialog open={dialog === "rename"} onOpenChange={(o) => !o && close()} title="Rename">
        <form className="ui-stack" onSubmit={(e) => { e.preventDefault(); const t = String(new FormData(e.currentTarget).get("title") ?? ""); start(async () => done(await renameArtifact(id, t))); }}>
          <Input name="title" aria-label="Name" defaultValue={title} maxLength={200} autoFocus aria-invalid={error ? true : undefined} />
          {error ? <p className="ui-error" role="alert">{error}</p> : null}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Button variant="secondary" onClick={close}>Cancel</Button><Button type="submit" loading={pending}>Rename</Button></div>
        </form>
      </ControlledDialog>
      <ControlledDialog open={dialog === "delete"} onOpenChange={(o) => !o && close()} title={`Delete “${title}”?`} description="It is removed for you and for everyone it is shared with.">
        {error ? <p className="ui-error" role="alert">{error}</p> : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Button variant="secondary" onClick={close}>Cancel</Button><Button variant="danger" loading={pending} onClick={() => start(async () => done(await deleteArtifact(id)))}>Delete</Button></div>
      </ControlledDialog>
    </>
  );
}
