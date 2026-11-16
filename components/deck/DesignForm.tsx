"use client";
/* S11: the design system. Six colours and two fonts; a live preview of real slide layouts; contrast checked as you
   type. A palette that would be unreadable cannot be saved, and the page says which pair is the problem. */
import { useEffect, useRef, useState, useTransition } from "react";
import { resetDesign, saveDesign } from "@/app/actions";
import { Banner } from "@/components/doc/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { IconAlert, IconCheck } from "@/components/ui/icons";
import { Badge } from "@/components/ui/misc";
import { COLOR_LABELS, FONTS, FONT_IDS, checkContrast, type DesignSystem, type FontId } from "@/lib/deck/design";
import { buildSlide } from "@/lib/deck/layouts";
import { SLIDE_H, SLIDE_W, type ColorRole, type Slide } from "@/lib/deck/types";
import { SlideView } from "./SlideView";

const HEX = /^#[0-9a-f]{6}$/i;
const SAMPLES: Slide[] = [
  buildSlide({ layout: "title", title: "Quarterly review", subtitle: "What changed, and what we do next" }),
  buildSlide({ layout: "bullets", title: "Revenue grew 14%", body: "- Renewals drove the growth\n- New business was flat\n- **One** region missed its target" }),
  buildSlide({ layout: "section", title: "The plan", subtitle: "Three steps, in order" }),
  buildSlide({ layout: "quote", quote: "We lose a day every week waiting for a step nobody owns.", attribution: "Team lead, operations" }),
];
function Preview({ slide, design }: { slide: Slide; design: DesignSystem }) {
  const ref = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0);
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(([e]) => setK(e!.contentRect.width / SLIDE_W)); ro.observe(el); return () => ro.disconnect(); }, []);
  return <div ref={ref} className="ui-ds-frame" aria-hidden><div style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${k})`, transformOrigin: "0 0", visibility: k ? undefined : "hidden" }}><SlideView slide={slide} design={design} /></div></div>;
}

export function DesignForm({ initial }: { initial: DesignSystem }) {
  const [saved, setSaved] = useState(initial);
  const [d, setD] = useState(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const valid = (Object.keys(COLOR_LABELS) as ColorRole[]).every((r) => HEX.test(d.colors[r]));
  const checks = valid ? checkContrast(d.colors) : [];
  const dirty = JSON.stringify({ c: d.colors, f: d.fonts, n: d.name }) !== JSON.stringify({ c: saved.colors, f: saved.fonts, n: saved.name });
  const setColor = (r: ColorRole, v: string) => { setDone(null); setD((x) => ({ ...x, colors: { ...x.colors, [r]: v.trim().toLowerCase() } })); };
  const setFont = (which: "heading" | "body", v: FontId) => { setDone(null); setD((x) => ({ ...x, fonts: { ...x.fonts, [which]: v } })); };
  const preview: DesignSystem = valid ? d : { ...d, colors: saved.colors };

  const save = () => start(async () => {
    setErrors([]); setDone(null);
    const res = await saveDesign({ name: d.name, colors: d.colors, fonts: d.fonts });
    if ("errors" in res) { setErrors(res.errors); return; }
    setSaved(res.design); setD(res.design); setDone("Saved. Every deck you own now uses it.");
  });
  const reset = () => start(async () => {
    setErrors([]);
    const res = await resetDesign();
    if ("errors" in res) { setErrors(res.errors); return; }
    setSaved(res.design); setD(res.design); setDone("Back to the default design system.");
  });

  return (
    <div className="ui-ds-grid">
      <form className="ui-ds-form" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <h2 className="ui-h3" style={{ margin: 0 }}>{saved.isDefault ? "Default design system" : saved.name}</h2>
          <Badge tone={saved.isDefault ? undefined : "accent"}>{saved.isDefault ? "Default" : "Yours"}</Badge>
        </div>
        <label className="ui-form-row"><span className="ui-label">Name</span><Input value={d.name} maxLength={60} onChange={(e) => { setDone(null); setD((x) => ({ ...x, name: e.target.value })); }} /></label>

        <fieldset className="ui-ds-colors" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="ui-label" style={{ marginBottom: 8 }}>Colours</legend>
          {(Object.keys(COLOR_LABELS) as ColorRole[]).map((r) => {
            const ok = HEX.test(d.colors[r]);
            return (
              <div key={r} className="ui-ds-color">
                <input type="color" aria-label={`${COLOR_LABELS[r].label}, colour picker`} value={ok ? d.colors[r] : saved.colors[r]} onChange={(e) => setColor(r, e.target.value)} />
                <div><label htmlFor={`ds-${r}`} className="ui-label">{COLOR_LABELS[r].label}</label><br /><span id={`ds-${r}-help`} className="ui-hint">{COLOR_LABELS[r].help}</span></div>
                <Input id={`ds-${r}`} value={d.colors[r]} maxLength={7} spellCheck={false} aria-invalid={ok ? undefined : true} aria-describedby={ok ? `ds-${r}-help` : `ds-${r}-err`} onChange={(e) => setColor(r, e.target.value)} />
                {ok ? null : <span id={`ds-${r}-err`} className="ui-error" style={{ gridColumn: "2 / -1" }}>Use a colour like #2a5f6a.</span>}
              </div>
            );
          })}
        </fieldset>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {(["heading", "body"] as const).map((which) => (
            <label key={which} className="ui-form-row"><span className="ui-label">{which === "heading" ? "Heading font" : "Body font"}</span>
              <select className="ui-field" value={d.fonts[which]} onChange={(e) => setFont(which, e.target.value as FontId)}>
                {(["serif", "sans"] as const).map((kind) => <optgroup key={kind} label={kind === "serif" ? "Serif" : "Sans-serif"}>{FONT_IDS.filter((f) => FONTS[f].kind === kind).map((f) => <option key={f} value={f}>{FONTS[f].label}</option>)}</optgroup>)}
              </select>
            </label>
          ))}
        </div>
        <p className="ui-hint">All fonts are open-licence and hosted by this app, so a deck looks the same for everyone. PowerPoint files name the same fonts; choose “basic fonts” when exporting if the file will be opened on a computer without them.</p>

        <div>
          <h3 className="ui-label" style={{ margin: "0 0 8px" }}>Readability</h3>
          {valid ? (
            <ul className="ui-ds-checks" aria-label="Contrast checks">
              {checks.map((c) => <li key={`${c.fg}-${c.bg}`} data-ok={c.ok}>{c.ok ? <IconCheck /> : <IconAlert />}<span>{COLOR_LABELS[c.fg].label} on {COLOR_LABELS[c.bg].label.toLowerCase()}: {c.ratio}:1 {c.ok ? "" : `(needs ${c.min}:1)`}</span></li>)}
            </ul>
          ) : <p className="ui-hint">Fix the colours marked above to see the contrast checks.</p>}
        </div>

        {errors.length ? <Banner tone="error" icon={<IconAlert />}>{errors.map((e) => <span key={e} style={{ display: "block" }}>{e}</span>)}</Banner> : null}
        {done ? <p className="ui-caption" role="status" style={{ margin: 0, display: "flex", gap: 6, alignItems: "center" }}><IconCheck /> {done}</p> : null}
        <div style={{ display: "flex", gap: 8 }}>
          <Button type="submit" loading={busy} disabled={!dirty || !valid}>Save design system</Button>
          <Button type="button" variant="secondary" disabled={busy || (!!saved.isDefault && !dirty)} onClick={reset}>Reset to default</Button>
        </div>
      </form>

      <div className="ui-ds-preview">
        <p className="ui-eyebrow" style={{ margin: 0 }}>Preview</p>
        {SAMPLES.map((s) => <Preview key={s.id} slide={s} design={preview} />)}
      </div>
    </div>
  );
}
