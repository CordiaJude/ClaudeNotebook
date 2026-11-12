import Link from "next/link";
import { Wordmark } from "@/components/brand/Mark";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { createClient } from "@/lib/supabase/server";
import { TEMPLATES } from "@/lib/templates";
import { createNotebook } from "./actions";
import { NotebookSearch } from "./NotebookSearch";

export const dynamic = "force-dynamic";

export default async function NotebooksPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: notebooks, error } = await supabase
    .from("notebooks").select("id,title,updated_at,owner_id").is("deleted_at", null).order("updated_at", { ascending: false });

  return (
    <main>
      <header className="cn-section" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 72 }}>
        <Link href="/notebooks" style={{ color: "inherit", textDecoration: "none" }}><Wordmark /></Link>
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="cn-caption">{auth.user?.email}</span>
          <ThemeToggle />
          <form action="/auth/signout" method="post"><Button variant="ghost" size="sm" type="submit">Sign out</Button></form>
        </span>
      </header>
      <div className="cn-section" style={{ padding: "32px 16px 96px" }}>
        <h1 className="cn-h-title" style={{ margin: "0 0 24px" }}>Notebooks</h1>
        <section aria-label="New notebook" style={{ marginBottom: 48 }}>
          <h2 className="cn-eyebrow" style={{ marginBottom: 12 }}>Start from a template</h2>
          <div className="cn-swatch-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
            {TEMPLATES.map((t) => (
              <form key={t.key} action={createNotebook}>
                <input type="hidden" name="template" value={t.key} />
                <button className="cn-template" style={{ width: "100%" }}><div className="cn-h3">{t.name}</div><div className="cn-caption">{t.blurb}</div></button>
              </form>
            ))}
          </div>
        </section>
        {error ? <p role="alert" style={{ color: "var(--cn-danger)" }}>Could not load notebooks: {error.message}</p> : null}
        <NotebookSearch notebooks={notebooks ?? []} />
      </div>
    </main>
  );
}
