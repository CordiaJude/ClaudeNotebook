/* One slide, drawn at its natural 1280 x 720 size. Callers scale it to fit. No interaction here: the editor lays
   its handles on top, and thumbnails and present mode use it as is. */
import type { CSSProperties } from "react";
import { FONTS, type DesignSystem } from "@/lib/deck/design";
import { JUSTIFY, LINE_HEIGHT, PARA_GAP, fontOf, weightOf } from "@/lib/deck/render";
import { parseLines } from "@/lib/deck/text";
import { SLIDE_H, SLIDE_W, type El, type Slide, type TextEl } from "@/lib/deck/types";

export function textStyle(el: TextEl, d: DesignSystem): CSSProperties {
  return { fontFamily: FONTS[fontOf(el, d)].css, fontSize: el.size, lineHeight: LINE_HEIGHT[el.role], fontWeight: weightOf(el.role), color: d.colors[el.color], textAlign: el.align, fontStyle: el.role === "quote" ? "italic" : undefined };
}
function TextBody({ el, design }: { el: TextEl; design: DesignSystem }) {
  return (
    <>
      {parseLines(el.text).map((l, i) => {
        const runs = l.runs.length ? l.runs.map((r, j) => (r.bold ? <strong key={j}>{r.text}</strong> : r.italic ? <em key={j}>{r.text}</em> : <span key={j}>{r.text}</span>)) : " ";
        const style: CSSProperties = { margin: 0, marginTop: i > 0 ? `${PARA_GAP}em` : 0 };
        return l.bullet
          ? <p key={i} style={{ ...style, display: "flex", gap: ".55em" }}><span aria-hidden style={{ color: design.colors[el.color === "onAccent" ? "onAccent" : "accent"] }}>•</span><span>{runs}</span></p>
          : <p key={i} style={style}>{runs}</p>;
      })}
    </>
  );
}
export function SlideView({ slide, design, hide, box }: { slide: Slide; design: DesignSystem; hide?: string | null; box?: (el: El) => { x: number; y: number; w: number; h: number } }) {
  return (
    <div className="ui-slide" style={{ width: SLIDE_W, height: SLIDE_H, background: design.colors[slide.bg] }}>
      {slide.elements.map((raw) => {
        const b = box ? box(raw) : raw;
        const pos: CSSProperties = { position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h };
        if (raw.type === "shape") return <div key={raw.id} style={{ ...pos, background: design.colors[raw.fill] }} />;
        return <div key={raw.id} style={{ ...pos, display: "flex", flexDirection: "column", justifyContent: JUSTIFY[raw.valign], overflow: "hidden", visibility: hide === raw.id ? "hidden" : undefined, ...textStyle(raw, design) }}><TextBody el={raw} design={design} /></div>;
      })}
      {slide.pending ? <div className="ui-slide-pending"><span className="ui-spin" aria-hidden /> Writing: {slide.pending}</div> : null}
    </div>
  );
}
/** A slide scaled to a fixed width (thumbnails, previews). */
export function ScaledSlide({ slide, design, width }: { slide: Slide; design: DesignSystem; width: number }) {
  const k = width / SLIDE_W;
  return <div aria-hidden style={{ width, height: SLIDE_H * k, overflow: "hidden", pointerEvents: "none" }}><div style={{ transform: `scale(${k})`, transformOrigin: "0 0", width: SLIDE_W, height: SLIDE_H }}><SlideView slide={slide} design={design} /></div></div>;
}
