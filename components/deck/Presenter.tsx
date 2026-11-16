"use client";
/* S08: present. One slide fills the screen; arrow keys, space or a click move on. Speaker notes can be shown under the
   slide. Esc leaves. It opens in the browser's full-screen mode when the browser allows it, and a button toggles it. */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { DesignSystem } from "@/lib/deck/design";
import { SLIDE_H, SLIDE_W, slideTitle, type Deck } from "@/lib/deck/types";
import { SlideView } from "./SlideView";

export function Presenter({ deck, design, backHref, start = 0 }: { deck: Deck; design: DesignSystem; backHref: string; start?: number }) {
  const router = useRouter();
  const slides = deck.slides.filter((s) => !s.pending);
  const [i, setI] = useState(Math.max(0, Math.min(slides.length - 1, start)));
  const [notes, setNotes] = useState(false);
  const [full, setFull] = useState(false);
  const [k, setK] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);

  const go = useCallback((to: number) => setI((cur) => Math.max(0, Math.min(slides.length - 1, typeof to === "number" ? to : cur))), [slides.length]);
  const leave = useCallback(() => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); router.push(backHref); }, [router, backHref]);
  const toggleFull = useCallback(() => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); else void root.current?.requestFullscreen?.().catch(() => {}); }, []);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setK(Math.min(e!.contentRect.width / SLIDE_W, e!.contentRect.height / SLIDE_H)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const onFull = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFull);
    onFull();
    root.current?.focus();
    return () => document.removeEventListener("fullscreenchange", onFull);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLButtonElement && (e.key === " " || e.key === "Enter")) return; // let buttons work
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) { e.preventDefault(); setI((c) => Math.min(slides.length - 1, c + 1)); }
      else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) { e.preventDefault(); setI((c) => Math.max(0, c - 1)); }
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(slides.length - 1);
      else if (e.key.toLowerCase() === "n") setNotes((v) => !v);
      else if (e.key.toLowerCase() === "f") toggleFull();
      else if (e.key === "Escape" && !document.fullscreenElement) leave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length, go, leave, toggleFull]);

  const slide = slides[i];
  if (!slide) {
    return (
      <main className="ui-present" ref={root} tabIndex={-1}>
        <div className="ui-present-stage"><p>This deck has no slides to present yet.</p></div>
        <div className="ui-present-bar"><Button variant="ghost" size="sm" onClick={leave}>Back to the deck</Button></div>
      </main>
    );
  }
  return (
    <main className="ui-present" ref={root} tabIndex={-1} aria-label={`Presenting ${deck.title || "deck"}`}>
      <div className="ui-present-stage" ref={stage} onClick={() => go(i + 1)}>
        <div style={{ width: SLIDE_W * k, height: SLIDE_H * k, visibility: k ? undefined : "hidden" }}>
          <div style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${k})`, transformOrigin: "0 0" }}><SlideView slide={slide} design={design} /></div>
        </div>
      </div>
      <div>
        {notes ? <div className="ui-present-notes" aria-label="Speaker notes"><h2>Speaker notes</h2>{slide.notes || "No notes for this slide."}</div> : null}
        <div className="ui-present-bar" role="toolbar" aria-label="Presenting">
          <Button variant="ghost" size="sm" onClick={() => go(i - 1)} disabled={i === 0}>Previous</Button>
          <span className="ui-present-count" aria-hidden>{i + 1} / {slides.length}</span>
          <Button variant="ghost" size="sm" onClick={() => go(i + 1)} disabled={i === slides.length - 1}>Next</Button>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" size="sm" aria-pressed={notes} onClick={() => setNotes((v) => !v)}>Notes</Button>
          <Button variant="ghost" size="sm" aria-pressed={full} onClick={toggleFull}>{full ? "Leave full screen" : "Full screen"}</Button>
          <Button variant="ghost" size="sm" onClick={leave}>Exit</Button>
        </div>
        <p className="sr-only" role="status" aria-live="polite">Slide {i + 1} of {slides.length}: {slideTitle(slide)}</p>
      </div>
    </main>
  );
}
