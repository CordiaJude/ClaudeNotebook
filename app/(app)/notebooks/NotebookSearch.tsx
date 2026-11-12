"use client";
import Link from "next/link";
import { useState } from "react";
import { Input } from "@/components/ui/field";

type Row = { id: string; title: string; updated_at: string | null };

export function NotebookSearch({ notebooks }: { notebooks: Row[] }) {
  const [q, setQ] = useState("");
  const shown = notebooks.filter((n) => n.title.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <section aria-label="Your notebooks">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h2 className="cn-eyebrow">All notebooks</h2>
        <Input aria-label="Search notebooks" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260 }} />
      </div>
      {shown.length === 0 ? (
        <p className="cn-caption">{notebooks.length === 0 ? "No notebooks yet. Pick a template above." : "No match."}</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {shown.map((n) => (
            <li key={n.id}>
              <Link href={`/n/${n.id}`} className="cn-card" style={{ textDecoration: "none", color: "inherit", gridAutoFlow: "column", justifyContent: "space-between" }}>
                <span className="cn-h3">{n.title}</span>
                <span className="cn-card-meta">{n.updated_at ? new Date(n.updated_at).toLocaleDateString() : ""}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
