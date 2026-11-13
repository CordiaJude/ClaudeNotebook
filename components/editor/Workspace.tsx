"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { JSONContent } from "@tiptap/react";
import { NotebookEditor, type Role } from "./Editor";
import { NotebookProvider, type EnumRow } from "./context";
import { TabTray } from "./TabTray";
import { AskPanel } from "./AskPanel";
import { Segmented } from "@/components/ui/misc";
import type { TabRow } from "@/lib/tabs";

export function Workspace(props: {
  notebookId: string; role: Role; author: { id: string; name: string };
  tabs: (TabRow & { liveblocks_room: string })[]; currentTab: TabRow & { liveblocks_room: string };
  members: { id: string; name: string }[]; notebooks: { id: string; title: string }[]; enums: EnumRow[];
  initialContent: JSONContent; syncsTitle: boolean;
}) {
  const router = useRouter();
  const [enums, setEnums] = useState(props.enums);
  const [rail, setRail] = useState<"ask" | "comments">("ask");
  const canEdit = props.role === "owner" || props.role === "editor";
  const ctx = useMemo(() => ({
    notebookId: props.notebookId, canEdit, author: props.author, members: props.members, notebooks: props.notebooks,
    tabs: props.tabs.map((t) => ({ id: t.id, name: t.name })), enums, setEnums,
    openTab: (id: string) => router.push(`/n/${props.notebookId}?tab=${id}`),
  }), [props, canEdit, enums, router]);

  return (
    <NotebookProvider value={ctx}>
      <nav className="cn-tray" aria-label="Tabs">
        <TabTray notebookId={props.notebookId} tabs={props.tabs} currentId={props.currentTab.id} canEdit={canEdit} />
      </nav>
      <main className="cn-paper-wrap">
        <div className="cn-paper">
          <NotebookEditor key={props.currentTab.id} notebookId={props.notebookId} room={props.currentTab.liveblocks_room} role={props.role} initialContent={props.initialContent} syncsTitle={props.syncsTitle} />
        </div>
      </main>
      <aside className="cn-rail" aria-label="Side panel" style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: 12, minHeight: 0 }}>
        <Segmented label="Side panel" value={rail} onValueChange={setRail} options={[{ value: "ask", label: "Ask Claude" }, { value: "comments", label: "Comments" }]} />
        {rail === "ask" ? (
          <AskPanel notebookId={props.notebookId} tabId={props.currentTab.id} canEdit={canEdit} />
        ) : (
          <div><p className="cn-eyebrow">Comments</p><p className="cn-caption">Threads on text, cells and the whole tab appear here.</p></div>
        )}
      </aside>
    </NotebookProvider>
  );
}
