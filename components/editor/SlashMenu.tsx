"use client";
import type { SlashState } from "@/lib/editor/slash";

export function SlashMenu({ state }: { state: SlashState | null }) {
  if (!state || state.items.length === 0 || !state.rect) return null;
  const top = Math.min(state.rect.bottom + 6, window.innerHeight - 320);
  const left = Math.min(state.rect.left, window.innerWidth - 260);
  return (
    <div className="cn-pop" role="listbox" aria-label="Insert block" style={{ position: "fixed", top, left, width: 248, maxHeight: 300, overflowY: "auto" }}>
      {state.items.map((it, i) => (
        <div key={it.id} role="option" aria-selected={i === state.index} className="cn-item" data-highlighted={i === state.index ? "" : undefined}
          onMouseDown={(e) => { e.preventDefault(); state.select(i); }}>
          <span style={{ display: "grid" }}><span>{it.label}</span><span className="cn-card-meta">{it.hint}</span></span>
        </div>
      ))}
    </div>
  );
}
