"use client";
/* S07: the slide editor. A rail of thumbnails, the slide itself with elements a person can move, resize and retype,
   and the speaker notes underneath. Everything a person does is a small change to the live deck, so it merges with
   what the AI or another person is doing at the same moment. Colours are picked by role, from the design system only. */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from "react";
import * as Y from "yjs";
import { Banner, EmptyState, ReadOnlyBanner } from "@/components/doc/parts";
import { Button } from "@/components/ui/button";
import { IconAlert, IconCopy, IconDeck, IconLock, IconPalette, IconPlus, IconText, IconUndo } from "@/components/ui/icons";
import { Segmented, Skeleton } from "@/components/ui/misc";
import { Popover } from "@/components/ui/overlays";
import type { Role } from "@/lib/data/types";
import { COLOR_LABELS, type DesignSystem } from "@/lib/deck/design";
import { LAYOUT_LABELS, buildSlide, contentOf } from "@/lib/deck/layouts";
import { COLOR_ROLES, LAYOUTS, SLIDE_H, SLIDE_W, newId, slideTitle, type ColorRole, type Deck, type El, type Layout, type Slide, type TextEl } from "@/lib/deck/types";
import { DECK_FIELD, readDeck, writeDeck } from "@/lib/deck/ydeck";
import { connectRoom, type RoomStatus } from "@/lib/rooms/client";
import { ScaledSlide, SlideView, textStyle } from "./SlideView";

const LOCAL = "local";
type Box = { x: number; y: number; w: number; h: number };
type Mode = "move" | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLES: { mode: Exclude<Mode, "move">; left: string; top: string; cursor: string }[] = [
  { mode: "nw", left: "0%", top: "0%", cursor: "nwse-resize" }, { mode: "n", left: "50%", top: "0%", cursor: "ns-resize" }, { mode: "ne", left: "100%", top: "0%", cursor: "nesw-resize" },
  { mode: "e", left: "100%", top: "50%", cursor: "ew-resize" }, { mode: "se", left: "100%", top: "100%", cursor: "nwse-resize" }, { mode: "s", left: "50%", top: "100%", cursor: "ns-resize" },
  { mode: "sw", left: "0%", top: "100%", cursor: "nesw-resize" }, { mode: "w", left: "0%", top: "50%", cursor: "ew-resize" },
];
const MIN = 24;
/** A box after a drag of (dx, dy) in slide units: moved, or one or two edges pulled. Never smaller than MIN, never off the slide. */
export function dragBox(o: Box, mode: Mode, dx: number, dy: number): Box {
  let { x, y, w, h } = o;
  if (mode === "move") { x = Math.max(0, Math.min(SLIDE_W - w, x + dx)); y = Math.max(0, Math.min(SLIDE_H - h, y + dy)); }
  else {
    if (mode.includes("w")) { const nx = Math.max(0, Math.min(o.x + o.w - MIN, o.x + dx)); w = o.x + o.w - nx; x = nx; }
    if (mode.includes("e")) w = Math.max(MIN, Math.min(SLIDE_W - o.x, o.w + dx));
    if (mode.includes("n")) { const ny = Math.max(0, Math.min(o.y + o.h - MIN, o.y + dy)); h = o.y + o.h - ny; y = ny; }
    if (mode.includes("s")) h = Math.max(MIN, Math.min(SLIDE_H - o.y, o.h + dy));
  }
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}
const PLACEHOLDER: Record<TextEl["role"], string> = { title: "Title", heading: "Title", body: "Text", caption: "Caption", number: "Number", quote: "Quote" };
const labelOf = (el: El) => (el.type === "shape" ? "Shape" : `Text: ${el.text.split("\n")[0]!.replace(/\*+/g, "").replace(/^- /, "").slice(0, 80) || `empty ${PLACEHOLDER[el.role].toLowerCase()}`}`);

function Swatches({ design, value, onPick, roles = COLOR_ROLES }: { design: DesignSystem; value: ColorRole; onPick: (r: ColorRole) => void; roles?: readonly ColorRole[] }) {
  return (
    <div className="ui-colors">
      <div className="ui-colors-row" role="radiogroup" aria-label="Brand colours">
        {roles.map((r) => <button key={r} type="button" role="radio" aria-checked={value === r} aria-label={COLOR_LABELS[r].label} title={COLOR_LABELS[r].label} className="ui-color" style={{ background: design.colors[r] }} onClick={() => onPick(r)} />)}
      </div>
      <p className="ui-hint" style={{ display: "flex", gap: 6, alignItems: "center" }}><IconLock /> Colours come from the design system.</p>
    </div>
  );
}

function Stage({ slide, design, canWrite, selected, onSelect, onBox, onText, onDelete, editing, setEditing }: {
  slide: Slide; design: DesignSystem; canWrite: boolean; selected: string | null; onSelect: (id: string | null) => void;
  onBox: (id: string, b: Box) => void; onText: (id: string, text: string) => void; onDelete: (id: string) => void; editing: string | null; setEditing: (id: string | null) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0);
  const [drag, setDrag] = useState<{ id: string; mode: Mode; box: Box } | null>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setK(e!.contentRect.width / SLIDE_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const boxOf = useCallback((el: El): Box => (drag?.id === el.id ? drag.box : el), [drag]);

  const startDrag = (e: RPointerEvent, el: El, mode: Mode) => {
    if (!canWrite || e.button !== 0 || k === 0) return;
    e.preventDefault(); e.stopPropagation();
    onSelect(el.id);
    e.currentTarget.closest(".ui-el")?.querySelector<HTMLElement>(".ui-el-hit")?.focus();
    const sx = e.clientX, sy = e.clientY, orig: Box = { x: el.x, y: el.y, w: el.w, h: el.h };
    let cur = orig, moved = false;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / k, dy = (ev.clientY - sy) / k;
      if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 3) moved = true;
      if (!moved) return;
      cur = dragBox(orig, mode, dx, dy);
      setDrag({ id: el.id, mode, box: cur });
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); setDrag(null); if (moved) onBox(el.id, cur); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const beginEdit = (el: El) => { if (canWrite && el.type === "text") { setEditing(el.id); onSelect(el.id); } };
  // The box keeps its own text while it is being typed in, so a change arriving from elsewhere never moves the caret; it is saved on leaving.
  const endEdit = (el: TextEl, value: string) => { if (editing !== el.id) return; if (value !== el.text) onText(el.id, value); setEditing(null); };
  const onKey = (e: RKeyboardEvent, el: El) => {
    if (!canWrite || editing) return;
    const step = e.shiftKey ? 1 : 8;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (d) { e.preventDefault(); onBox(el.id, dragBox(el, e.altKey ? "se" : "move", d[0]!, d[1]!)); return; }
    if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); beginEdit(el); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); onDelete(el.id); }
    else if (e.key === "Escape") { onSelect(null); (e.currentTarget as HTMLElement).blur(); }
  };

  return (
    <div ref={wrap} className="ui-stage" role="group" aria-label={`Slide: ${slideTitle(slide)}`} onPointerDown={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("ui-stage-art")) onSelect(null); }}>
      <div className="ui-stage-art" aria-hidden={canWrite || undefined} style={{ transform: `scale(${k})`, visibility: k ? undefined : "hidden" }}><SlideView slide={slide} design={design} hide={editing} box={boxOf} /></div>
      {canWrite && k > 0 && !slide.pending ? slide.elements.map((el) => {
        const b = boxOf(el), isSel = selected === el.id, isEditing = editing === el.id;
        const state = drag?.id === el.id ? (drag.mode === "move" ? "moving" : "resizing") : isSel ? "selected" : "default";
        const pos: CSSProperties = { left: b.x * k, top: b.y * k, width: b.w * k, height: b.h * k };
        return (
          <div key={el.id} className="ui-el" data-state={state} data-el={el.id} style={pos}>
            {/* The hit area is the element for the keyboard and screen readers; what is drawn on it sits beside it, not inside. */}
            <div className="ui-el-hit" role="button" tabIndex={0} aria-label={labelOf(el)} aria-pressed={isSel} aria-roledescription="slide element"
              onPointerDown={(e) => startDrag(e, el, "move")} onDoubleClick={() => beginEdit(el)} onFocus={() => onSelect(el.id)} onKeyDown={(e) => onKey(e, el)} />
            {isEditing && el.type === "text" ? (
              <textarea className="ui-el-edit" aria-label="Edit text" autoFocus defaultValue={el.text}
                style={{ ...textStyle(el, design), fontSize: el.size * k }} onPointerDown={(e) => e.stopPropagation()} onBlur={(e) => endEdit(el, e.currentTarget.value)}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") { e.preventDefault(); const hit = e.currentTarget.closest(".ui-el")?.querySelector<HTMLElement>(".ui-el-hit"); endEdit(el, e.currentTarget.value); hit?.focus(); } }} />
            ) : el.type === "text" && el.text.trim() === "" ? <span aria-hidden className="ui-el-ph" style={{ fontSize: Math.max(11, el.size * k * 0.8), textAlign: el.align }}>{PLACEHOLDER[el.role]}</span> : null}
            {isSel && !isEditing ? <span aria-hidden className="ui-el-tag">{el.type === "text" ? <IconText size={11} /> : null}{state === "moving" ? "Moving" : state === "resizing" ? "Resizing" : el.type === "text" ? "Text" : "Shape"}</span> : null}
            {isSel && !isEditing ? HANDLES.map((hd) => <span key={hd.mode} aria-hidden className="ui-el-handle" data-handle={hd.mode} style={{ left: hd.left, top: hd.top, cursor: hd.cursor }} onPointerDown={(e) => startDrag(e, el, hd.mode)} />) : null}
          </div>
        );
      }) : null}
    </div>
  );
}

function LiveDeck({ ydoc, role, design }: { ydoc: Y.Doc; role: Role; design: DesignSystem }) {
  const canWrite = role === "owner" || role === "editor";
  const [deck, setDeck] = useState<Deck>(() => readDeck(ydoc));
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [said, setSaid] = useState("");
  const [lastIndex, setLastIndex] = useState(0);
  const undo = useRef<Y.UndoManager | null>(null);
  const rail = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const on = () => setDeck(readDeck(ydoc));
    ydoc.on("update", on);
    const um = new Y.UndoManager(ydoc.getMap(DECK_FIELD), { trackedOrigins: new Set([LOCAL]) });
    undo.current = um;
    return () => { ydoc.off("update", on); um.destroy(); undo.current = null; };
  }, [ydoc]);

  /** One change by this person. Each is its own undo step, except typing (`typing`), where a run of keystrokes undoes together. */
  const mutate = useCallback((fn: (d: Deck) => Deck, typing = false) => {
    if (!canWrite) return;
    const cur = readDeck(ydoc), next = fn(cur);
    if (next === cur) return;
    if (!typing) undo.current?.stopCapturing();
    writeDeck(ydoc, next, LOCAL);
    if (!typing) undo.current?.stopCapturing();
  }, [ydoc, canWrite]);
  const found = deck.slides.findIndex((s) => s.id === currentId);
  // When the current slide is deleted (by anyone), stay at the same place in the deck rather than jumping to the start.
  const index = deck.slides.length === 0 ? -1 : found >= 0 ? found : Math.min(lastIndex, deck.slides.length - 1);
  if (index >= 0 && index !== lastIndex) setLastIndex(index);
  const slide = index >= 0 ? deck.slides[index]! : null;
  const el = slide?.elements.find((e) => e.id === selected) ?? null;

  const onSlide = useCallback((id: string, fn: (s: Slide) => Slide, typing = false) => mutate((d) => ({ ...d, slides: d.slides.map((s) => (s.id === id ? fn(s) : s)) }), typing), [mutate]);
  const onEl = (id: string, fn: (e: El) => El) => { if (slide) onSlide(slide.id, (s) => ({ ...s, elements: s.elements.map((e) => (e.id === id ? fn(e) : e)) })); };
  const go = (i: number, focus = false) => { const s = deck.slides[i]; if (!s) return; setCurrentId(s.id); setSelected(null); setEditing(null); if (focus) requestAnimationFrame(() => (rail.current?.querySelectorAll<HTMLElement>(".ui-thumb-hit")[i])?.focus()); };
  const addSlide = () => {
    const s = buildSlide({ layout: deck.slides.length === 0 ? "title" : "bullets" });
    mutate((d) => { const at = index + 1; return { ...d, slides: [...d.slides.slice(0, at), s, ...d.slides.slice(at)] }; });
    setCurrentId(s.id); setSelected(null); setSaid(`Slide ${index + 2} added.`);
  };
  const duplicate = () => {
    if (!slide) return;
    const copy: Slide = { ...slide, id: newId(), elements: slide.elements.map((e) => ({ ...e, id: newId() })) };
    mutate((d) => ({ ...d, slides: [...d.slides.slice(0, index + 1), copy, ...d.slides.slice(index + 1)] }));
    setCurrentId(copy.id); setSaid("Slide duplicated.");
  };
  const removeSlide = (i: number) => {
    const s = deck.slides[i];
    if (!s) return;
    mutate((d) => ({ ...d, slides: d.slides.filter((x) => x.id !== s.id) }));
    setSaid(`Slide ${i + 1} deleted. Press Control Z to undo.`);
    const next = deck.slides[i + 1] ?? deck.slides[i - 1];
    setCurrentId(next?.id ?? null); setSelected(null);
  };
  const moveSlide = (from: number, to: number) => {
    if (to < 0 || to >= deck.slides.length || from === to) return;
    const id = deck.slides[from]!.id;
    mutate((d) => { const slides = [...d.slides]; const i = slides.findIndex((s) => s.id === id); if (i < 0) return d; const [s] = slides.splice(i, 1); slides.splice(to, 0, s!); return { ...d, slides }; });
    setCurrentId(id); setSaid(`Slide moved to position ${to + 1}.`);
    requestAnimationFrame(() => (rail.current?.querySelectorAll<HTMLElement>(".ui-thumb-hit")[to])?.focus());
  };
  const addText = () => { if (!slide) return; const e: TextEl = { id: newId(), type: "text", x: 160, y: 280, w: 960, h: 120, text: "", role: "body", size: 28, color: slide.bg === "accent" ? "onAccent" : "text", align: "left", valign: "top" }; onSlide(slide.id, (s) => ({ ...s, elements: [...s.elements, e] })); setSelected(e.id); };
  const addShape = () => { if (!slide) return; const e: El = { id: newId(), type: "shape", x: 480, y: 280, w: 320, h: 160, fill: slide.bg === "accent" ? "onAccent" : "accent" }; onSlide(slide.id, (s) => ({ ...s, elements: [...s.elements, e] })); setSelected(e.id); };
  const removeEl = (id: string) => { if (slide) onSlide(slide.id, (s) => ({ ...s, elements: s.elements.filter((e) => e.id !== id) })); setSelected(null); };
  const setLayout = (layout: Layout) => { if (slide) onSlide(slide.id, (s) => buildSlide(contentOf(s, layout), { id: s.id, notes: s.notes })); setSelected(null); };
  const history = (redo: boolean) => { if (redo) undo.current?.redo(); else undo.current?.undo(); setSelected(null); };

  const thumbs = useMemo(() => deck.slides.map((s) => ({ id: s.id, title: slideTitle(s), slide: s })), [deck.slides]);

  if (deck.slides.length === 0) {
    return (
      <div className="ui-deck-empty">
        {!canWrite ? <ReadOnlyBanner role={role === "commenter" ? "commenter" : "viewer"} /> : null}
        <EmptyState icon={<IconDeck />} title="No slides yet" body={canWrite ? "Describe the deck you need in the chat and the AI drafts it with speaker notes, or start with a slide of your own." : "This deck is empty."} action={canWrite ? <Button variant="secondary" onClick={addSlide}><IconPlus /> Add a slide</Button> : undefined} />
      </div>
    );
  }
  return (
    <div className="ui-deck" onKeyDown={(e) => { if (canWrite && !editing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !(e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); history(e.shiftKey); } }}>
      <ol ref={rail} className="ui-rail-slides ui-deck-rail" aria-label="Slides">
        {thumbs.map((t, i) => (
          <li key={t.id} className="ui-thumb" aria-current={i === index ? "true" : undefined} data-dragging={dragging === i ? "" : undefined} draggable={canWrite}
            onDragStart={(e) => { setDragging(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id); }} onDragEnd={() => setDragging(null)}
            onDragOver={(e) => { if (dragging !== null) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); if (dragging !== null) moveSlide(dragging, i); setDragging(null); }}>
            <span aria-hidden>{i + 1}</span>
            <div className="ui-thumb-frame ui-thumb-frame--live">
              <ScaledSlide slide={t.slide} design={design} width={132} />
              <button type="button" className="ui-thumb-hit" aria-label={`Slide ${i + 1}: ${t.title}${t.slide.pending ? ", being written" : ""}`} onClick={() => go(i)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const to = i + (e.key === "ArrowDown" ? 1 : -1); if (e.altKey && canWrite) moveSlide(i, to); else go(to, true); }
                  else if ((e.key === "Delete" || e.key === "Backspace") && canWrite) { e.preventDefault(); removeSlide(i); }
                }} />
            </div>
          </li>
        ))}
        {canWrite ? <li style={{ display: "grid" }}><button type="button" className="ui-thumb-add" aria-label="Add a slide" onClick={addSlide}><IconPlus /></button></li> : null}
      </ol>

      <div className="ui-deck-main">
        {canWrite ? (
          <>
          <div className="ui-toolbar ui-toolbar--flat ui-deck-bar" role="toolbar" aria-label="Slide tools">
            <Button variant="icon" aria-label="Undo" title="Undo (Ctrl+Z)" onClick={() => history(false)}><IconUndo /></Button>
            <Button variant="icon" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" onClick={() => history(true)}><span style={{ display: "inline-flex", transform: "scaleX(-1)" }}><IconUndo /></span></Button>
            <span className="ui-toolbar-sep" aria-hidden />
            <label className="ui-deck-pick"><span className="sr-only">Layout</span>
              <select className="ui-field ui-deck-select" aria-label="Layout" value={slide!.layout} onChange={(e) => setLayout(e.target.value as Layout)}>{LAYOUTS.map((l) => <option key={l} value={l}>{LAYOUT_LABELS[l]}</option>)}</select>
            </label>
            <Popover trigger={<Button variant="ghost" size="sm" aria-label="Slide background"><IconPalette /> <span className="ui-ws-wide">Background</span></Button>}>
              <Swatches design={design} roles={["background", "surface", "accent"]} value={slide!.bg} onPick={(r) => onSlide(slide!.id, (s) => ({ ...s, bg: r as Slide["bg"] }))} />
            </Popover>
            <span className="ui-toolbar-sep" aria-hidden />
            <Button variant="ghost" size="sm" onClick={addText} aria-label="Add text"><IconText /> <span className="ui-ws-wide">Text</span></Button>
            <Button variant="ghost" size="sm" onClick={addShape} aria-label="Add a shape"><span aria-hidden className="ui-deck-shape" /> <span className="ui-ws-wide">Shape</span></Button>
            <span className="ui-toolbar-sep" aria-hidden />
            <Button variant="icon" aria-label="Duplicate slide" title="Duplicate slide" onClick={duplicate}><IconCopy /></Button>
            <Button variant="ghost" size="sm" onClick={() => removeSlide(index)}>Delete slide</Button>
          </div>
          <div className="ui-toolbar ui-toolbar--flat ui-deck-bar ui-deck-bar--el" role="toolbar" aria-label="Selected element">
            {el ? (
              <>
                <span className="ui-deck-what">{el.type === "text" ? "Text" : "Shape"}</span>
                {el.type === "text" ? (
                  <>
                    <Button variant="icon" aria-label="Smaller text" title="Smaller text" onClick={() => onEl(el.id, (e) => ({ ...(e as TextEl), size: Math.max(10, (e as TextEl).size - 2) }))}>A−</Button>
                    <span className="ui-deck-size"><span className="sr-only">Text size </span>{el.size}</span>
                    <Button variant="icon" aria-label="Larger text" title="Larger text" onClick={() => onEl(el.id, (e) => ({ ...(e as TextEl), size: Math.min(240, (e as TextEl).size + 2) }))}>A+</Button>
                    <Segmented label="Align" value={el.align} onValueChange={(v) => onEl(el.id, (e) => ({ ...(e as TextEl), align: v }))} options={[{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }]} />
                    <Button variant="ghost" size="sm" onClick={() => setEditing(el.id)}>Edit text</Button>
                  </>
                ) : null}
                <Popover trigger={<Button variant="ghost" size="sm" aria-label="Colour"><span aria-hidden className="ui-color ui-color--sm" style={{ background: design.colors[el.type === "text" ? el.color : el.fill] }} /> Colour</Button>}>
                  <Swatches design={design} value={el.type === "text" ? el.color : el.fill} onPick={(r) => onEl(el.id, (e) => (e.type === "text" ? { ...e, color: r } : { ...e, fill: r }))} />
                </Popover>
                <Button variant="ghost" size="sm" onClick={() => removeEl(el.id)}>Remove</Button>
              </>
            ) : <span className="ui-hint ui-deck-help">Click something on the slide to change it. Double-click text to edit it; start a line with “- ” for a bullet. Drag to move, pull a handle to resize, or use the arrow keys (Alt to resize).</span>}
          </div>
          </>
        ) : <ReadOnlyBanner role={role === "commenter" ? "commenter" : "viewer"} />}

        <Stage key={slide!.id} slide={slide!} design={design} canWrite={canWrite} selected={selected} onSelect={setSelected} editing={editing} setEditing={setEditing}
          onBox={(id, b) => onEl(id, (e) => ({ ...e, ...b }))} onText={(id, text) => onEl(id, (e) => (e.type === "text" ? { ...e, text } : e))} onDelete={removeEl} />

        <div className="ui-deck-notes">
          <label className="ui-eyebrow" htmlFor="deck-notes">Speaker notes</label>
          {canWrite
            ? <textarea id="deck-notes" className="ui-field" rows={3} placeholder="What you will say on this slide" value={slide!.notes} maxLength={4000} onChange={(e) => onSlide(slide!.id, (s) => ({ ...s, notes: e.target.value }), true)} />
            : <p id="deck-notes" className="ui-caption" style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{slide!.notes || "No notes for this slide."}</p>}
        </div>
        <p className="sr-only" role="status" aria-live="polite">{said}</p>
      </div>
    </div>
  );
}

export function DeckEditor({ room, role, design, onStatus, onSaving }: { room: string; role: Role; design: DesignSystem; onStatus?: (s: RoomStatus) => void; onSaving?: (pending: boolean) => void }) {
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [status, setStatus] = useState<RoomStatus>("connecting");
  const canWrite = role === "owner" || role === "editor";
  useEffect(() => {
    let alive = true;
    const conn = connectRoom(room, { canWrite, onStatus: (s) => { if (alive) { setStatus(s); onStatus?.(s); } }, onSaving: (p) => { if (alive) onSaving?.(p); } });
    void conn.synced.then(() => { if (alive) setYdoc(conn.ydoc); });
    return () => { alive = false; setYdoc(null); conn.destroy(); };
  }, [room, canWrite, onStatus, onSaving]);

  if (status === "revoked") return <Banner tone="error" icon={<IconAlert />} action={<Button asChild variant="ghost" size="sm"><Link href="/library">Library</Link></Button>}>Your access to this deck was removed.</Banner>;
  if (status === "failed") return <Banner tone="error" icon={<IconAlert />} action={<Button variant="ghost" size="sm" onClick={() => window.location.reload()}>Reload</Button>}>This deck could not be opened. Check your connection, then reload.</Banner>;
  return (
    <>
      {status === "reconnecting" ? <Banner tone="warning">Reconnecting. Your edits are kept and will be saved.</Banner> : null}
      {ydoc ? <LiveDeck ydoc={ydoc} role={role} design={design} /> : <div className="ui-deck" aria-busy="true" aria-label="Opening the deck"><div className="ui-stack"><Skeleton h={74} /><Skeleton h={74} /></div><Skeleton h={320} /></div>}
    </>
  );
}
