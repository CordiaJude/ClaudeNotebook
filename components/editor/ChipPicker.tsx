"use client";
import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { ControlledDialog } from "@/components/ui/overlays";
import { createClient } from "@/lib/supabase/client";
import { useNotebook, type EnumRow } from "./context";

type Kind = "user" | "tab" | "notebook" | "date" | "dropdown";
const TITLES: Record<Kind, string> = { user: "Mention a person", tab: "Link to a tab", notebook: "Link to a notebook", date: "Insert a date", dropdown: "Insert a dropdown" };

export function ChipPicker({ editor }: { editor: Editor }) {
  const ctx = useNotebook();
  const [kind, setKind] = useState<Kind | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [q, setQ] = useState("");
  const [newName, setNewName] = useState("");
  const [newOpts, setNewOpts] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    const h = (e: Event) => { setKind((e as CustomEvent<{ kind: Kind }>).detail.kind); setQ(""); setErr(""); };
    window.addEventListener("cn:insert-chip", h);
    return () => window.removeEventListener("cn:insert-chip", h);
  }, []);

  const put = (content: Record<string, unknown>) => { editor.chain().focus().insertContent(content).run(); setKind(null); };
  const list = (rows: { id: string; label: string }[], make: (r: { id: string; label: string }) => Record<string, unknown>) => (
    <div style={{ display: "grid", gap: 4 }}>
      {rows.length > 6 ? <Input aria-label="Filter" placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} /> : null}
      {rows.filter((r) => r.label.toLowerCase().includes(q.toLowerCase())).map((r) => (
        <button key={r.id} className="cn-item" style={{ border: 0, background: "none", font: "inherit", textAlign: "left" }} onClick={() => put(make(r))}>{r.label}</button>
      ))}
      {rows.length === 0 ? <p className="cn-caption">Nothing to pick yet.</p> : null}
    </div>
  );

  async function createEnum() {
    const options = newOpts.split(",").map((s) => s.trim()).filter(Boolean).map((name) => ({ name }));
    if (!newName.trim() || options.length === 0) { setErr("Give the list a name and at least one option (comma-separated)."); return; }
    const { data, error } = await createClient().from("enums").insert({ notebook_id: ctx.notebookId, name: newName.trim(), options }).select("id,name,options").single();
    if (error || !data) { setErr(error?.message ?? "Could not create list"); return; }
    ctx.setEnums([...ctx.enums, data as EnumRow]);
    put({ type: "dropdownChip", attrs: { enumId: data.id, index: 0 } });
    setNewName(""); setNewOpts("");
  }

  return (
    <ControlledDialog open={kind !== null} onOpenChange={(o) => !o && setKind(null)} title={kind ? TITLES[kind] : ""}>
      {kind === "user" ? list(ctx.members.map((m) => ({ id: m.id, label: m.name })), (r) => ({ type: "mentionChip", attrs: { kind: "user", ref: r.id, label: r.label } })) : null}
      {kind === "tab" ? list(ctx.tabs.map((t) => ({ id: t.id, label: t.name })), (r) => ({ type: "mentionChip", attrs: { kind: "tab", ref: r.id, label: r.label } })) : null}
      {kind === "notebook" ? list(ctx.notebooks.map((n) => ({ id: n.id, label: n.title })), (r) => ({ type: "mentionChip", attrs: { kind: "notebook", ref: r.id, label: r.label } })) : null}
      {kind === "date" ? (
        <div style={{ display: "grid", gap: 12 }}>
          <Input type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Button disabled={!date} onClick={() => put({ type: "dateChip", attrs: { value: date } })}>Insert date</Button>
        </div>
      ) : null}
      {kind === "dropdown" ? (
        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <p className="cn-eyebrow" style={{ marginBottom: 4 }}>Existing lists</p>
            {list(ctx.enums.map((e) => ({ id: e.id, label: `${e.name} (${e.options.filter((o) => !o.removed).map((o) => o.name).join(", ")})` })), (r) => ({ type: "dropdownChip", attrs: { enumId: r.id, index: 0 } }))}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <p className="cn-eyebrow">New list</p>
            <Input aria-label="List name" placeholder="Status" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Input aria-label="Options" placeholder="On track, At risk, Blocked" value={newOpts} onChange={(e) => setNewOpts(e.target.value)} />
            <Button variant="secondary" onClick={createEnum}>Create and insert</Button>
          </div>
          {err ? <p role="alert" style={{ color: "var(--cn-danger)", margin: 0 }}>{err}</p> : null}
        </div>
      ) : null}
    </ControlledDialog>
  );
}
