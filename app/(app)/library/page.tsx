import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/library/AppHeader";
import { CardMenu, LibraryFilters } from "@/components/library/Controls";
import { NewFromPrompt, Templates } from "@/components/library/NewFromPrompt";
import { EmptyState, LibraryCard } from "@/components/doc/parts";
import { Button } from "@/components/ui/button";
import { IconDoc, IconSearch } from "@/components/ui/icons";
import { BRAND } from "@/lib/brand";
import { getData } from "@/lib/data";
import { flushMirrors } from "@/lib/rooms";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Library · ${BRAND.name}` };

const ago = (iso: string): string => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "Edited just now";
  if (m < 60) return `Edited ${m} min ago`;
  if (m < 60 * 24) return `Edited ${Math.round(m / 60)} h ago`;
  if (m < 60 * 24 * 14) return `Edited ${Math.round(m / 1440)} d ago`;
  return `Edited ${new Date(iso).toLocaleDateString("en", { day: "numeric", month: "short" })}`;
};

/** S02: everything you own or were given, with search and a type filter. S03's templates sit under the prompt. */
export default async function Library({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string }> }) {
  const user = await requireUser("/library");
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 100);
  const kind = sp.kind === "doc" || sp.kind === "deck" ? sp.kind : "all";
  const data = getData();
  await flushMirrors();
  const [items, templates] = await Promise.all([data.listArtifacts(user.id, { q, kind: kind === "all" ? undefined : kind }), data.templates()]);
  const filtered = !!q || kind !== "all";
  return (
    <>
      <AppHeader user={user} />
      <main className="ui-lib">
        <section aria-label="Start something new" className="ui-lib-new">
          <h1 className="ui-h1" style={{ margin: 0 }}>What are you writing, {user.name.split(" ")[0]}?</h1>
          <NewFromPrompt />
          <div>
            <h2 className="ui-eyebrow" style={{ margin: "0 0 8px" }}>Or start from a template</h2>
            <Templates templates={templates} />
          </div>
        </section>
        <section aria-label="Your library" className="ui-lib-list">
          <div className="ui-lib-bar">
            <h2 className="ui-h2" style={{ margin: 0 }}>Library</h2>
            <LibraryFilters q={q} kind={kind} />
          </div>
          {items.length === 0 ? (
            filtered
              ? <EmptyState icon={<IconSearch />} title="No matches" body={q ? `Nothing in your library matches “${q}”. Check the spelling or clear the search.` : "You have nothing of this type yet."} action={<Button asChild variant="secondary"><Link href="/library">Show everything</Link></Button>} />
              : <EmptyState icon={<IconDoc />} title="Nothing here yet" body="Describe what you need above and a first draft appears in the editor." />
          ) : (
            <ul className="ui-lib-grid" aria-label={`${items.length} item${items.length === 1 ? "" : "s"}`}>
              {items.map((a) => (
                <li key={a.id} className="ui-lib-item">
                  <LibraryCard kind={a.kind} title={a.title} preview={a.preview} meta={ago(a.updatedAt)} shared={a.role === "owner" ? undefined : a.ownerName} href={`/a/${a.id}`} />
                  {a.role === "owner" ? <CardMenu id={a.id} title={a.title} /> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
