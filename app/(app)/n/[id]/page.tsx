import Link from "next/link";
import { notFound } from "next/navigation";
import { Wordmark } from "@/components/brand/Mark";
import type { Role } from "@/components/editor/Editor";
import type { EnumRow } from "@/components/editor/context";
import { Workspace } from "@/components/editor/Workspace";
import { flatten, type TabRow } from "@/lib/tabs";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { createClient } from "@/lib/supabase/server";
import { blankTabContent, seedContent } from "@/lib/templates";

export const dynamic = "force-dynamic";

export default async function NotebookPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string; tab?: string }> }) {
  const { id } = await params;
  const { t, tab: tabParam } = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return notFound();

  const { data: nb } = await supabase.from("notebooks").select("id,title,deleted_at").eq("id", id).maybeSingle();
  if (!nb || nb.deleted_at) return notFound();
  const [{ data: tabRows }, { data: member }, { data: memberRows }, { data: nbRows }, { data: enumRows }, { data: profile }] = await Promise.all([
    supabase.from("tabs").select("id,name,order_key,parent_tab_id,liveblocks_room").eq("notebook_id", id),
    supabase.from("notebook_members").select("role").eq("notebook_id", id).eq("user_id", auth.user.id).maybeSingle(),
    supabase.from("notebook_members").select("user_id, profiles(display_name)").eq("notebook_id", id),
    supabase.from("notebooks").select("id,title").is("deleted_at", null).order("updated_at", { ascending: false }).limit(100),
    supabase.from("enums").select("id,name,options").eq("notebook_id", id),
    supabase.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle(),
  ]);
  const tabs = flatten(tabRows ?? []).map(({ depth: _d, ...r }) => r) as (TabRow & { liveblocks_room: string })[];
  if (tabs.length === 0 || !member) return notFound();
  const currentTab = tabs.find((x) => x.id === tabParam) ?? tabs[0]!;
  const author = { id: auth.user.id, name: profile?.display_name ?? "Someone" };
  const isFirst = currentTab.id === tabs[0]!.id;
  // Seeds only apply when the tab's Yjs doc is empty (first open).
  const initialContent = isFirst && t ? seedContent(t, author) : blankTabContent(currentTab.name, author);

  return (
    <div className="cn-shell">
      <header className="cn-topbar">
        <Link href="/notebooks" style={{ color: "inherit", textDecoration: "none" }} aria-label="All notebooks"><Wordmark size={18} /></Link>
        <span className="cn-h3" style={{ flex: 1, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nb.title}</span>
        <ThemeToggle />
      </header>
      <Workspace
        notebookId={id} role={member.role as Role} author={author} tabs={tabs} currentTab={currentTab}
        members={(memberRows ?? []).map((m) => ({ id: m.user_id, name: (m.profiles as unknown as { display_name: string } | null)?.display_name ?? "Someone" }))}
        notebooks={nbRows ?? []} enums={(enumRows ?? []) as EnumRow[]} initialContent={initialContent} syncsTitle={isFirst}
      />
      <aside className="cn-rail" aria-label="Comments">
        <p className="cn-eyebrow">Comments</p>
        <p className="cn-caption">Threads on text, cells and the whole tab appear here.</p>
      </aside>
    </div>
  );
}
