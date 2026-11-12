import Link from "next/link";
import { notFound } from "next/navigation";
import { Wordmark } from "@/components/brand/Mark";
import { NotebookEditor, type Role } from "@/components/editor/Editor";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { createClient } from "@/lib/supabase/server";
import { templateByKey } from "@/lib/templates";

export const dynamic = "force-dynamic";

export default async function NotebookPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { id } = await params;
  const { t } = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return notFound();

  const { data: nb } = await supabase.from("notebooks").select("id,title,deleted_at").eq("id", id).maybeSingle();
  if (!nb || nb.deleted_at) return notFound();
  const [{ data: tabs }, { data: member }] = await Promise.all([
    supabase.from("tabs").select("id,name,order_key,parent_tab_id,liveblocks_room").eq("notebook_id", id).order("order_key"),
    supabase.from("notebook_members").select("role").eq("notebook_id", id).eq("user_id", auth.user.id).maybeSingle(),
  ]);
  const tab = tabs?.[0];
  if (!tab || !member) return notFound();

  return (
    <div className="cn-shell">
      <header className="cn-topbar">
        <Link href="/notebooks" style={{ color: "inherit", textDecoration: "none" }} aria-label="All notebooks"><Wordmark size={18} /></Link>
        <span className="cn-h3" style={{ flex: 1, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nb.title}</span>
        <ThemeToggle />
      </header>
      <nav className="cn-tray" aria-label="Tabs">
        <div role="tree" aria-label="Tabs">
          {tabs!.map((x) => (
            <div key={x.id} className="cn-tab" role="treeitem" aria-selected={x.id === tab.id} aria-current={x.id === tab.id ? "true" : undefined} tabIndex={0}>{x.name}</div>
          ))}
        </div>
      </nav>
      <main className="cn-paper-wrap">
        <div className="cn-paper">
          <NotebookEditor notebookId={id} room={tab.liveblocks_room} role={member.role as Role} initialContent={templateByKey(t).content} />
        </div>
      </main>
      <aside className="cn-rail" aria-label="Comments">
        <p className="cn-eyebrow">Comments</p>
        <p className="cn-caption">Threads on text, cells and the whole tab appear here.</p>
      </aside>
    </div>
  );
}
