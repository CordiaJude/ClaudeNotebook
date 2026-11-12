"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { ControlledDialog } from "@/components/ui/overlays";
import { createClient } from "@/lib/supabase/client";
import { useNotebook, type EnumRow } from "./context";

/** Options are edited by index so existing chips (enumId + index) never shift: removing an option hides it, it does not delete it. */
export function EnumManager() {
  const ctx = useNotebook();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  if (!ctx.canEdit) return null;

  async function save(e: EnumRow) {
    const { error } = await createClient().from("enums").update({ name: e.name, options: e.options }).eq("id", e.id);
    setErr(error ? error.message : "");
  }
  const patch = (id: string, fn: (e: EnumRow) => EnumRow) => ctx.setEnums(ctx.enums.map((e) => (e.id === id ? fn(e) : e)));

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>Lists</Button>
      <ControlledDialog open={open} onOpenChange={setOpen} title="Dropdown lists" description="One list per column (Status, Owner…). Removing an option hides it; existing chips keep their value.">
        <div style={{ display: "grid", gap: 16, maxHeight: "60vh", overflowY: "auto" }}>
          {ctx.enums.length === 0 ? <p className="cn-caption">No lists yet. Insert a dropdown with / to create one.</p> : null}
          {ctx.enums.map((e) => (
            <section key={e.id} className="cn-card" aria-label={`List ${e.name}`}>
              <Input aria-label="List name" value={e.name} onChange={(ev) => patch(e.id, (x) => ({ ...x, name: ev.target.value }))} onBlur={() => save(e)} />
              {e.options.map((o, i) => (
                <div key={i} style={{ display: "flex", gap: 8, opacity: o.removed ? 0.5 : 1 }}>
                  <Input aria-label={`Option ${i + 1}`} value={o.name} disabled={o.removed} onChange={(ev) => patch(e.id, (x) => ({ ...x, options: x.options.map((p, j) => (j === i ? { ...p, name: ev.target.value } : p)) }))} onBlur={() => save(e)} />
                  <Button variant="ghost" size="sm" onClick={() => { const n = { ...e, options: e.options.map((p, j) => (j === i ? { ...p, removed: !p.removed } : p)) }; patch(e.id, () => n); void save(n); }}>{o.removed ? "Restore" : "Remove"}</Button>
                </div>
              ))}
              <Button variant="secondary" size="sm" style={{ justifySelf: "start" }} onClick={() => { const n = { ...e, options: [...e.options, { name: "New option" }] }; patch(e.id, () => n); void save(n); }}>Add option</Button>
            </section>
          ))}
          {err ? <p role="alert" style={{ color: "var(--cn-danger)", margin: 0 }}>{err}</p> : null}
        </div>
      </ControlledDialog>
    </>
  );
}
