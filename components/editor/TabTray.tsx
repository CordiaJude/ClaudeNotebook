"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { IconGrip, IconPlus } from "@/components/ui/icons";
import { ControlledDialog, Menu } from "@/components/ui/overlays";
import { flatten, type TabRow } from "@/lib/tabs";
import { addTab, deleteTab, moveTab, nestTab, renameTab, stepTab, unnestTab, type TabResult } from "@/app/(app)/n/[id]/tab-actions";

export function TabTray({ notebookId, tabs, currentId, canEdit }: { notebookId: string; tabs: TabRow[]; currentId: string; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<TabRow | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; where: "before" | "after" } | null>(null);
  const rows = flatten(tabs);

  const run = (fn: () => Promise<TabResult>, after?: (r: Extract<TabResult, { ok: true }>) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) { setMsg(r.fix); return; }
      setMsg("");
      after?.(r);
      router.refresh();
    });
  const go = (id: string) => router.push(`/n/${notebookId}?tab=${id}`);

  return (
    <div>
      <div role="tree" aria-label="Tabs" aria-busy={pending}>
        {rows.map((t) => (
          <div
            key={t.id}
            className={`cn-tab ${t.depth ? "cn-tab--nested" : ""}`}
            role="treeitem"
            aria-selected={t.id === currentId}
            aria-current={t.id === currentId ? "true" : undefined}
            aria-level={t.depth + 1}
            draggable={canEdit && renaming !== t.id}
            onDragStart={() => setDragId(t.id)}
            onDragEnd={() => { setDragId(null); setOver(null); }}
            onDragOver={(e) => { if (!dragId || dragId === t.id) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setOver({ id: t.id, where: e.clientY < r.top + r.height / 2 ? "before" : "after" }); }}
            onDrop={(e) => { e.preventDefault(); if (dragId && over) run(() => moveTab(notebookId, dragId, over.id, over.where)); setDragId(null); setOver(null); }}
            style={{ boxShadow: over?.id === t.id ? (over.where === "before" ? "inset 0 2px 0 var(--cn-accent)" : "inset 0 -2px 0 var(--cn-accent)") : undefined }}
          >
            {canEdit ? <span className="cn-handle" aria-hidden><IconGrip /></span> : null}
            {renaming === t.id ? (
              <Input autoFocus aria-label="Tab name" defaultValue={t.name} style={{ padding: "2px 6px", height: 28 }}
                onBlur={(e) => { const v = e.target.value; setRenaming(null); if (v.trim() && v !== t.name) run(() => renameTab(notebookId, t.id, v)); }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenaming(null); }} />
            ) : (
              <Link href={`/n/${notebookId}?tab=${t.id}`} style={{ flex: 1, color: "inherit", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</Link>
            )}
            {canEdit ? (
              <Menu
                trigger={<button className="cn-btn cn-btn--ghost cn-btn--icon" style={{ width: 24, height: 24 }} aria-label={`Actions for ${t.name}`}>⋯</button>}
                items={[
                  { label: "Rename", onSelect: () => setRenaming(t.id) },
                  ...(t.depth === 0 ? [{ label: "Add sub-tab", onSelect: () => run(() => addTab(notebookId, t.id), (r) => r.tabId && go(r.tabId)) }] : []),
                  "sep",
                  { label: "Move up", onSelect: () => run(() => stepTab(notebookId, t.id, "up")) },
                  { label: "Move down", onSelect: () => run(() => stepTab(notebookId, t.id, "down")) },
                  t.depth === 0 ? { label: "Nest under previous", onSelect: () => run(() => nestTab(notebookId, t.id)) } : { label: "Move to top level", onSelect: () => run(() => unnestTab(notebookId, t.id)) },
                  "sep",
                  { label: "Delete…", onSelect: () => setConfirmDel(t) },
                ]}
              />
            ) : null}
          </div>
        ))}
      </div>
      {canEdit ? (
        <Button variant="ghost" size="sm" style={{ marginTop: 8 }} onClick={() => run(() => addTab(notebookId, null), (r) => r.tabId && go(r.tabId))}><IconPlus /> Add tab</Button>
      ) : null}
      {msg ? <p role="alert" className="cn-caption" style={{ color: "var(--cn-danger)", marginTop: 8 }}>{msg}</p> : null}
      <ControlledDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)} title={`Delete “${confirmDel?.name ?? ""}”?`} description="Its sub-tabs move to the top level. Text stays recoverable from history.">
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={() => setConfirmDel(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => { const t = confirmDel!; setConfirmDel(null); run(() => deleteTab(notebookId, t.id), (r) => { if (t.id === currentId && r.nextTabId) go(r.nextTabId); }); }}>Delete</Button>
        </div>
      </ControlledDialog>
    </div>
  );
}
