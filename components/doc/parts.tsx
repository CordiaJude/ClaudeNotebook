"use client";
/* Product components from the recon list (replica/recon.md, "Components"), built once in isolation and shown at /design.
   They are presentational: state comes in through props, events go out through callbacks. Spec: replica/design/components.md. */
import { useId, useState, type ReactNode } from "react";
import { Avatar, Badge, Kbd, Segmented, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { Dialog, Menu, Popover } from "@/components/ui/overlays";
import { Select } from "@/components/ui/select";
import {
  IconAlert, IconBold, IconChart, IconCheck, IconComment, IconCopy, IconDeck, IconDoc, IconDownload, IconEye, IconGrip, IconImage, IconItalic, IconLink,
  IconList, IconListOrdered, IconLock, IconPeople, IconPlus, IconRetry, IconSend, IconSparkle, IconStop, IconTable, IconText, IconUnderline, IconUndo,
} from "@/components/ui/icons";
import { BRAND } from "@/lib/brand";

export type Kind = "doc" | "deck";
const AI = BRAND.assistant;

/* ---------- Drafting: placeholder section + presence ---------- */
export function PendingBlock({ intent }: { intent: string }) {
  return (
    <div className="ui-pending" role="status" aria-label={`Not written yet: ${intent}`}>
      <Skeleton w="38%" h={18} />
      <Skeleton w="92%" /><Skeleton w="78%" />
      <span className="ui-pending-intent">{intent}</span>
    </div>
  );
}
export function AiPresencePill({ section }: { section: string }) {
  return <span className="ui-presence" role="status" aria-live="polite"><span className="ui-dot" />{AI} is writing · {section}</span>;
}

/* ---------- Rich-text toolbar: full + floating selection menu ---------- */
export function RichToolbar({ disabled }: { disabled?: boolean }) {
  const b = (label: string, icon: ReactNode, pressed?: boolean) => <Button variant="icon" aria-label={label} aria-pressed={pressed} disabled={disabled}>{icon}</Button>;
  return (
    <div className="ui-toolbar ui-toolbar--flat" role="toolbar" aria-label="Formatting">
      <Menu trigger={<Button variant="ghost" size="sm" disabled={disabled}>Heading 2 <IconChevron /></Button>} items={[{ label: "Text" }, { label: "Heading 1" }, { label: "Heading 2" }, { label: "Heading 3" }]} />
      <span className="ui-toolbar-sep" aria-hidden />
      {b("Bold", <IconBold />, true)}{b("Italic", <IconItalic />)}{b("Underline", <IconUnderline />)}{b("Link", <IconLink />)}
      <span className="ui-toolbar-sep" aria-hidden />
      {b("Bullet list", <IconList />)}{b("Numbered list", <IconListOrdered />)}{b("Table", <IconTable />)}{b("Image", <IconImage />)}{b("Chart", <IconChart />)}
    </div>
  );
}
function IconChevron() { return <span aria-hidden style={{ fontSize: 10, opacity: 0.7 }}>▾</span>; }
export function SelectionMenu({ canEdit = true, canComment = true, onEditWithAi, onComment }: { canEdit?: boolean; canComment?: boolean; onEditWithAi?: () => void; onComment?: () => void }) {
  return (
    <div className="ui-toolbar" role="toolbar" aria-label="Selection">
      {canEdit ? <><Button variant="ghost" size="sm" onClick={onEditWithAi}><IconSparkle /> Edit with {AI}</Button><span className="ui-toolbar-sep" aria-hidden /></> : null}
      {canEdit ? <><Button variant="icon" aria-label="Bold"><IconBold /></Button><Button variant="icon" aria-label="Italic"><IconItalic /></Button><Button variant="icon" aria-label="Link"><IconLink /></Button></> : null}
      {canComment ? <Button variant="icon" aria-label="Comment" onClick={onComment}><IconComment /></Button> : null}
    </div>
  );
}
/** F02: the instruction box that opens under a selection. Only the quoted range will change. */
export function AiEditComposer({ quote, busy, error, onSubmit, onCancel }: { quote: string; busy?: boolean; error?: string; onSubmit?: (instruction: string) => void; onCancel?: () => void }) {
  const [v, setV] = useState("");
  return (
    <form className="ui-aiedit" aria-label={`Edit with ${AI}`} onSubmit={(e) => { e.preventDefault(); if (v.trim()) onSubmit?.(v.trim()); }}>
      <div className="ui-aiedit-quote" title={quote}>“{quote}”</div>
      <Input aria-label="What should change?" placeholder="Make it shorter, warmer, more formal…" value={v} onChange={(e) => setV(e.target.value)} disabled={busy} aria-invalid={error ? true : undefined} />
      {error ? <p className="ui-error" role="alert">{error}</p> : <p className="ui-hint">Only the selected text changes.</p>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" type="submit" loading={busy} disabled={!busy && !v.trim()}>{busy ? "Rewriting" : "Rewrite"}</Button>
      </div>
    </form>
  );
}
export function BlockHandle() {
  return <button className="ui-btn ui-btn--ghost ui-btn--icon" aria-label="Move this block or open its menu" style={{ cursor: "grab" }}><IconGrip /></button>;
}
const SLASH = ["Heading 1", "Heading 2", "Heading 3", "Bullet list", "Numbered list", "Table", "Image"];
export function SlashMenu() {
  return (
    <div className="ui-pop" role="listbox" aria-label="Insert" style={{ width: 220, animation: "none" }}>
      {SLASH.map((s, i) => <div key={s} role="option" aria-selected={i === 0} className="ui-item" data-highlighted={i === 0 ? "" : undefined}>{s}</div>)}
    </div>
  );
}

/* ---------- Tab bar ---------- */
export function TabItem({ name, current, nested, renaming }: { name: string; current?: boolean; nested?: boolean; renaming?: boolean }) {
  return (
    <div className={`ui-tab ${nested ? "ui-tab--nested" : ""}`} aria-current={current ? "true" : undefined} role="treeitem" aria-selected={!!current} tabIndex={0}>
      <span className="ui-handle" aria-hidden><IconGrip /></span>
      {renaming ? <input aria-label="Tab name" defaultValue={name} /> : <span style={{ flex: 1 }}>{name}</span>}
    </div>
  );
}

/* ---------- Table and chart blocks ---------- */
export const CELL_TINTS = ["gray", "red", "orange", "yellow", "green", "blue", "purple"] as const;
export function TableBlock({ readOnly }: { readOnly?: boolean }) {
  const [bg, setBg] = useState<string | null>("green");
  return (
    <div style={{ display: "grid", gap: 12, width: "100%" }}>
      <table className="ui-table">
        <thead><tr><th>Risk</th><th>Owner</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td>Supplier is two weeks late</td><td>Priya</td><td style={{ background: bg ? `var(--color-tint-${bg})` : undefined }}>On track</td></tr>
          <tr><td>Budget drops 10%</td><td>Sam</td><td>Open</td></tr>
        </tbody>
      </table>
      {readOnly ? null : (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Popover trigger={<Button variant="secondary" size="sm">Cell colour</Button>}>
            <div className="ui-swatches" role="group" aria-label="Cell colour">
              {CELL_TINTS.map((c) => <button key={c} className="ui-swatch" aria-label={c} aria-pressed={bg === c} style={{ background: `var(--color-tint-${c})` }} onClick={() => setBg(bg === c ? null : c)} />)}
            </div>
          </Popover>
          <Menu trigger={<Button variant="secondary" size="sm">Table</Button>} items={[{ label: "Add row below" }, { label: "Add column right" }, "sep", { label: "Delete row" }, { label: "Delete column" }]} />
        </div>
      )}
    </div>
  );
}
/** The frame a chart sits in. The chart drawing itself and its palette arrive with the "Charts" feature. */
export function ChartBlock({ title, caption }: { title: string; caption: string }) {
  return (
    <figure className="ui-figure">
      <strong className="ui-label">{title}</strong>
      <div className="ui-figure-body" role="img" aria-label={title}><span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><IconChart /> Chart</span></div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

/* ---------- Comments ---------- */
export type CommentState = "open" | "sent" | "resolved";
export function CommentBadge({ count, state = "open", label }: { count: number; state?: CommentState; label?: string }) {
  return <button className="ui-cbadge" data-state={state} aria-label={label ?? `${count} comment${count === 1 ? "" : "s"}, ${state === "sent" ? `sent to ${AI}` : state}`}>{state === "sent" ? <IconSparkle size={12} /> : <IconComment size={12} />}{count}</button>;
}
export function CommentPin({ n }: { n: number }) {
  return <span className="ui-pin" role="img" aria-label={`Comment ${n}`}>{n}</span>;
}
export function CommentCard({ author, time, body, replies = 0, active, fromAi, state = "open", color }: { author: string; time: string; body: string; replies?: number; active?: boolean; fromAi?: boolean; state?: CommentState; color?: string }) {
  return (
    <article className={`ui-card ${active ? "ui-card--active" : ""}`} aria-label={`Comment by ${author}`}>
      <div className="ui-card-head">
        <Avatar name={author} ai={fromAi} color={color} /><strong>{author}</strong><span className="ui-card-meta">{time}</span>
        <span style={{ flex: 1 }} />
        {state === "sent" ? <Badge tone="accent"><IconSparkle size={12} /> Sent to {AI}</Badge> : state === "resolved" ? <Badge><IconCheck size={12} /> Resolved</Badge> : null}
      </div>
      <p className="ui-card-body">{body}</p>
      {replies > 0 ? <button className="ui-btn ui-btn--ghost ui-btn--sm" style={{ justifySelf: "start" }}>Show {replies} replies</button> : null}
      {state === "resolved" ? null : <div style={{ display: "flex", gap: 8 }}><Button variant="secondary" size="sm">Reply</Button><Button variant="ghost" size="sm">Resolve</Button></div>}
    </article>
  );
}
export function CommentComposer({ canAskAi = true, onSubmit }: { canAskAi?: boolean; onSubmit?: (body: string) => void }) {
  const [v, setV] = useState("");
  const left = 1000 - v.length;
  return (
    <form className="ui-card" aria-label="New comment" onSubmit={(e) => { e.preventDefault(); if (v.trim()) onSubmit?.(v.trim()); }}>
      <Textarea aria-label="Comment" placeholder={canAskAi ? `Comment, or type @${AI} to ask for a change` : "Add a comment"} value={v} maxLength={1000} onChange={(e) => setV(e.target.value)} />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span className="ui-card-meta" aria-live="polite">{left < 100 ? `${left} left` : canAskAi ? "" : `Asking ${AI} needs edit access`}</span>
        <span style={{ flex: 1 }} /><Button variant="ghost" size="sm">Cancel</Button><Button size="sm" type="submit" disabled={!v.trim()}>Comment</Button>
      </div>
    </form>
  );
}

/* ---------- Prompt box (chat, with Output picker) ---------- */
export function PromptBox({ placeholder, withOutput, hero, disabled, sending, running, onSubmit, onStop, defaultValue = "" }: {
  placeholder?: string; withOutput?: boolean; hero?: boolean; disabled?: boolean; sending?: boolean; running?: boolean; defaultValue?: string;
  onSubmit?: (text: string, kind: Kind) => void; onStop?: () => void;
}) {
  const [v, setV] = useState(defaultValue);
  const [kind, setKind] = useState<Kind>("doc");
  const hint = useId();
  const send = () => { if (v.trim() && !disabled && !sending) onSubmit?.(v.trim(), kind); };
  return (
    <form className={`ui-prompt ${hero ? "ui-prompt--hero" : ""}`} data-disabled={disabled ? "" : undefined} onSubmit={(e) => { e.preventDefault(); send(); }}>
      <textarea aria-label="Message" aria-describedby={hint} rows={hero ? 2 : 1} placeholder={placeholder ?? "Ask for a change"} value={v} disabled={disabled || sending}
        onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
      <div className="ui-prompt-bar">
        {withOutput ? <Segmented label="Output" value={kind} onValueChange={setKind} options={[{ value: "doc", label: "Doc" }, { value: "deck", label: "Slides" }]} /> : <span id={hint} className="ui-card-meta">{disabled ? "You can view this, not edit it" : <><Kbd>Enter</Kbd> to send</>}</span>}
        {withOutput ? <span id={hint} className="sr-only">Enter to send, Shift and Enter for a new line</span> : null}
        {running
          ? <Button variant="secondary" size="sm" onClick={onStop}><IconStop /> Stop</Button>
          : <Button variant="primary" size="sm" type="submit" loading={sending} disabled={disabled || (!sending && !v.trim())} aria-label={hero ? undefined : sending ? "Sending" : "Send"}>{sending ? null : <IconSend />}{hero ? "Draft" : null}</Button>}
      </div>
    </form>
  );
}

/* ---------- Chat messages ---------- */
export function ChatMessage({ role, streaming, children, onUndo, onRetry }: { role: "user" | "ai" | "error"; streaming?: boolean; children: ReactNode; onUndo?: () => void; onRetry?: () => void }) {
  if (role === "error") return <div className="ui-msg ui-msg--error" role="alert"><IconAlert style={{ marginTop: 3, flex: "none" }} /><span style={{ flex: 1 }}>{children}</span>{onRetry ? <Button variant="ghost" size="sm" onClick={onRetry}><IconRetry /> Try again</Button> : null}</div>;
  if (role === "user") return <div className="ui-msg ui-msg--user"><span className="sr-only">You: </span>{children}</div>;
  return (
    <div className="ui-msg ui-msg--ai" aria-busy={streaming || undefined}>
      <span className="sr-only">{AI}: </span>{children}{streaming ? <span className="ui-caret" aria-hidden /> : null}
      {onUndo && !streaming ? <div style={{ marginTop: 6 }}><Button variant="ghost" size="sm" onClick={onUndo}><IconUndo /> Undo this change</Button></div> : null}
    </div>
  );
}
export function ProgressLine({ label, done }: { label: string; done?: boolean }) {
  return <div className="ui-progress" data-done={done ? "" : undefined} role="status">{done ? <IconCheck /> : <span className="ui-dot" />}{label}</div>;
}
export type Question = { id: string; prompt: string; options?: string[] };
/** F01: the AI's 1 to 3 clarifying questions. Each is a radio group plus free text; "Skip" drafts with defaults. */
export function QuestionsCard({ questions, answered, onSubmit, onSkip }: { questions: Question[]; answered?: Record<string, string>; onSubmit?: (answers: Record<string, string>) => void; onSkip?: () => void }) {
  const [a, setA] = useState<Record<string, string>>(answered ?? {});
  const locked = !!answered;
  return (
    <form className="ui-questions" aria-label="A few questions before drafting" onSubmit={(e) => { e.preventDefault(); onSubmit?.(a); }}>
      {questions.map((q) => (
        <fieldset key={q.id} className="ui-question" disabled={locked}>
          <legend>{q.prompt}</legend>
          {q.options ? (
            <div className="ui-options" role="radiogroup" aria-label={q.prompt}>
              {q.options.map((o) => <button key={o} type="button" role="radio" aria-checked={a[q.id] === o} className="ui-option" onClick={() => setA({ ...a, [q.id]: o })}>{o}</button>)}
            </div>
          ) : null}
          <Input aria-label={q.options ? `${q.prompt} Something else` : q.prompt} placeholder={q.options ? "Something else" : "Your answer"} value={q.options?.includes(a[q.id] ?? "") ? "" : (a[q.id] ?? "")} onChange={(e) => setA({ ...a, [q.id]: e.target.value })} />
        </fieldset>
      ))}
      {locked ? null : <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Button variant="ghost" size="sm" onClick={onSkip}>Skip, just draft</Button><Button size="sm" type="submit">Start drafting</Button></div>}
    </form>
  );
}
export function ChatPanel({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) {
  return (
    <section className="ui-panel" aria-label="Chat">
      <div className="ui-panel-head"><IconSparkle /><strong className="ui-label">{title}</strong></div>
      <div className="ui-msgs" role="log" aria-live="polite">{children}</div>
      <div className="ui-composer">{footer}</div>
    </section>
  );
}

/* ---------- Library ---------- */
export function LibraryCard({ kind, title, meta, shared, href = "#" }: { kind: Kind; title: string; meta: string; shared?: string; href?: string }) {
  return (
    <a className="ui-libcard" href={href}>
      <div className={`ui-libcard-thumb ${kind === "deck" ? "ui-libcard-thumb--deck" : ""}`} aria-hidden>
        {kind === "doc" ? <><Skeleton w="55%" h={10} style={{ animation: "none" }} /><Skeleton w="92%" h={6} style={{ animation: "none" }} /><Skeleton w="84%" h={6} style={{ animation: "none" }} /><Skeleton w="70%" h={6} style={{ animation: "none" }} /></>
          : <><div className="ui-serif" style={{ fontSize: 15, fontWeight: 550, color: "var(--color-text)" }}>{title}</div><Skeleton w={64} h={5} style={{ animation: "none", background: "var(--color-accent)" }} /></>}
      </div>
      <div style={{ display: "grid", gap: 2, padding: "0 4px 4px" }}>
        <div className="ui-libcard-title">{title}</div>
        <div className="ui-libcard-meta">{kind === "doc" ? <IconDoc /> : <IconDeck />}<span className="sr-only">{kind === "doc" ? "Doc." : "Deck."}</span><span>{meta}</span>{shared ? <Badge><IconPeople size={12} /><span className="sr-only">Shared by</span> {shared}</Badge> : null}</div>
      </div>
    </a>
  );
}
export function TemplateCard({ name, blurb, kind = "doc" }: { name: string; blurb: string; kind?: Kind }) {
  return <button className="ui-template">{kind === "doc" ? <IconDoc /> : <IconDeck />}<span className="ui-label">{name}</span><span className="ui-caption">{blurb}</span></button>;
}
export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return <div className="ui-empty"><span className="ui-empty-icon" aria-hidden>{icon}</span><strong className="ui-label" style={{ color: "var(--color-text)" }}>{title}</strong><span className="ui-caption" style={{ maxWidth: 360 }}>{body}</span>{action ? <div style={{ marginTop: 8 }}>{action}</div> : null}</div>;
}
export function Banner({ tone, icon, children, action }: { tone?: "error" | "warning"; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return <div className={`ui-banner ${tone ? `ui-banner--${tone}` : ""}`} role={tone === "error" ? "alert" : "status"}>{icon}<span style={{ flex: 1 }}>{children}</span>{action}</div>;
}

/* ---------- Share dialog ---------- */
export type Person = { name: string; email: string; role: "owner" | "editor" | "commenter" | "viewer"; pending?: boolean };
const ROLE_OPTIONS = [{ value: "viewer", label: "Can view" }, { value: "commenter", label: "Can comment" }, { value: "editor", label: "Can edit" }];
export function SharePanel({ people, link, error }: { people: Person[]; link?: "off" | "viewer" | "commenter"; error?: string }) {
  const [role, setRole] = useState("viewer");
  const [linkRole, setLinkRole] = useState(link ?? "off");
  const isPrivate = people.length === 1 && linkRole === "off";
  return (
    <div className="ui-stack">
      <form style={{ display: "flex", gap: 8 }} onSubmit={(e) => e.preventDefault()}>
        <Input type="email" style={{ flex: 1, minWidth: 0 }} aria-label="Email address" placeholder="name@example.com" aria-invalid={error ? true : undefined} />
        <Select label="Role" value={role} onValueChange={setRole} options={ROLE_OPTIONS} />
        <Button type="submit">Send</Button>
      </form>
      {error ? <p className="ui-error" role="alert">{error}</p> : null}
      <div role="list" aria-label="People with access">
        {people.map((p, i) => (
          <div key={p.email} role="listitem" className="ui-share-row">
            <Avatar name={p.name} color={`var(--color-person-${(i % 6) + 1})`} />
            <span className="ui-share-who"><span>{p.name}</span><small>{p.email}</small></span>
            {p.pending ? <Badge tone="guest">Invited</Badge> : null}
            {p.role === "owner" ? <Badge>Owner</Badge> : <Select label={`Role for ${p.name}`} value={p.role} onValueChange={() => {}} options={[...ROLE_OPTIONS, { value: "remove", label: "Remove" }]} />}
          </div>
        ))}
      </div>
      <div className="ui-linkbox">
        {isPrivate ? <IconLock /> : <IconLink />}
        <span style={{ flex: 1 }}>{linkRole === "off" ? (isPrivate ? "Private. Only you can open this." : "Only people listed above can open this.") : `Anyone signed in with the link can ${linkRole === "viewer" ? "view" : "comment"}.`}</span>
        <Select label="Link access" value={linkRole} onValueChange={(v) => setLinkRole(v as typeof linkRole)} options={[{ value: "off", label: "Link off" }, { value: "viewer", label: "Link: view" }, { value: "commenter", label: "Link: comment" }]} />
        {linkRole === "off" ? null : <Button variant="secondary" size="sm"><IconCopy /> Copy</Button>}
      </div>
    </div>
  );
}
export function ShareDialog(props: { people: Person[]; link?: "off" | "viewer" | "commenter"; error?: string; title?: string }) {
  return <Dialog trigger={<Button variant="secondary"><IconPeople /> Share</Button>} title={`Share “${props.title ?? "Untitled"}”`} description="People you add must sign in to open it."><SharePanel {...props} /></Dialog>;
}

/* ---------- Export menu ---------- */
const FORMATS: Record<Kind, { key: string; label: string }[]> = {
  doc: [{ key: "docx", label: "Word (.docx)" }, { key: "pdf", label: "PDF" }, { key: "md", label: "Markdown" }],
  deck: [{ key: "pptx", label: "PowerPoint (.pptx)" }, { key: "pdf", label: "PDF" }, { key: "html", label: "Web page (.html)" }, { key: "png", label: "This slide as PNG" }],
};
export type ExportState = { format: string; status: "working" | "done" | "error" };
export function ExportList({ kind, state, onExport }: { kind: Kind; state?: ExportState; onExport?: (format: string) => void }) {
  return (
    <div className="ui-pop" role="menu" aria-label="Export" style={{ width: 320, maxWidth: "100%", animation: "none" }}>
      {FORMATS[kind].map((f) => {
        const s = state?.format === f.key ? state.status : undefined;
        return (
          <div key={f.key} role="menuitem" tabIndex={-1} className="ui-item" aria-disabled={state?.status === "working" ? true : undefined} aria-busy={s === "working" || undefined} onClick={() => onExport?.(f.key)}>
            <IconDownload /><span>{f.label}</span>
            <span className="ui-item-meta" role={s ? "status" : undefined}>
              {s === "working" ? <><span className="ui-spin" aria-hidden /> Preparing</> : s === "done" ? <><IconCheck /> Downloaded</> : s === "error" ? <span style={{ color: "var(--color-danger)", display: "inline-flex", gap: 6, alignItems: "center" }}><IconAlert /> Failed. Try again</span> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
export function ExportMenu({ kind }: { kind: Kind }) {
  return <Menu trigger={<Button variant="secondary"><IconDownload /> Export</Button>} items={FORMATS[kind].map((f) => ({ label: f.label }))} />;
}

/* ---------- Change attribution (S13) ---------- */
export type Change = { who: string; ai?: boolean; askedBy?: string; what: string; when: string };
export function AttributionList({ changes }: { changes: Change[] }) {
  return (
    <ul aria-label="Changes" style={{ display: "grid", gap: 2, listStyle: "none", margin: 0, padding: 0, width: "100%" }}>
      {changes.map((c, i) => (
        <li key={i} className="ui-version" style={{ cursor: "default", alignItems: "center" }}>
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center", minWidth: 0 }}><Avatar name={c.who} ai={c.ai} color={`var(--color-person-${(i % 6) + 1})`} /><span><strong>{c.who}</strong>{c.ai && c.askedBy ? <span className="ui-card-meta"> for {c.askedBy}</span> : null} · {c.what}</span></span>
          <span className="ui-card-meta">{c.when}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Slides: thumbnail rail, canvas element, notes, colour picker ---------- */
export function SlideRail({ titles, current, dragging }: { titles: string[]; current: number; dragging?: number }) {
  return (
    <ol className="ui-rail-slides" aria-label="Slides">
      {titles.map((t, i) => (
        <li key={i} className="ui-thumb" aria-current={i === current ? "true" : undefined} data-dragging={i === dragging ? "" : undefined}>
          <span aria-hidden>{i + 1}</span>
          <button className="ui-thumb-frame" aria-label={`Slide ${i + 1}: ${t}`} style={{ font: "inherit", textAlign: "left" }}>
            <span className="ui-serif" style={{ fontSize: 9, fontWeight: 600, color: "var(--color-text)" }}>{t}</span>
            <Skeleton w="70%" h={3} style={{ animation: "none" }} /><Skeleton w="50%" h={3} style={{ animation: "none" }} />
          </button>
        </li>
      ))}
      <li style={{ display: "grid" }}><button className="ui-thumb-add" aria-label="Add a slide"><IconPlus /></button></li>
    </ol>
  );
}
export type ElState = "default" | "selected" | "moving" | "resizing" | "locked";
/** One element on a slide. Text elements are named by their own text; others need a `label`. */
export function CanvasElement({ type, state = "default", box, label, children }: { type: "text" | "image" | "shape" | "chart"; state?: ElState; box: { x: number; y: number; w: number; h: number }; label?: string; children?: ReactNode }) {
  const pct = (n: number) => `${n}%`;
  const active = state === "selected" || state === "moving" || state === "resizing";
  const icon = type === "text" ? <IconText size={11} /> : type === "image" ? <IconImage size={11} /> : type === "chart" ? <IconChart size={11} /> : null;
  const typeName = type[0]!.toUpperCase() + type.slice(1);
  return (
    <div className="ui-el" data-state={state} style={{ left: pct(box.x), top: pct(box.y), width: pct(box.w), height: pct(box.h) }}>
      <div className="ui-el-body" role="button" tabIndex={0} aria-roledescription={`${type} element`} aria-label={type === "text" ? undefined : (label ?? typeName)} aria-pressed={active} aria-disabled={state === "locked" || undefined}>{children}</div>
      {active || state === "locked" ? <span className="ui-el-tag">{state === "locked" ? <IconLock size={11} /> : icon}{state === "moving" ? "Moving" : state === "resizing" ? "Resizing" : state === "locked" ? "Locked" : typeName}</span> : null}
      {active ? [[-5, -5], [-5, "auto"], ["auto", -5], ["auto", "auto"]].map(([t, l], i) => <span key={i} aria-hidden className="ui-el-handle" style={{ top: t === "auto" ? undefined : (t as number), bottom: t === "auto" ? -5 : undefined, left: l === "auto" ? undefined : (l as number), right: l === "auto" ? -5 : undefined }} />) : null}
    </div>
  );
}
export function SlideCanvas({ children, notes }: { children: ReactNode; notes?: string }) {
  return (
    <div style={{ width: "100%" }}>
      <div className="ui-canvas" role="group" aria-label="Slide">{children}</div>
      {notes !== undefined ? <div className="ui-notes" style={{ borderRadius: "0 0 var(--radius-sm) var(--radius-sm)", border: "1px solid var(--color-border)", borderTop: 0 }}><span className="ui-eyebrow">Speaker notes</span><p style={{ margin: "4px 0 0" }}>{notes}</p></div> : null}
    </div>
  );
}
/** Brand-locked: only the design system's colours can be picked. Free: adds a custom colour field. */
export function ColorPicker({ colors, locked, value, onChange }: { colors: { name: string; value: string }[]; locked?: boolean; value?: string; onChange?: (v: string) => void }) {
  const [v, setV] = useState(value ?? colors[0]?.value);
  const pick = (c: string) => { setV(c); onChange?.(c); };
  return (
    <div className="ui-colors">
      <div className="ui-colors-row" role="radiogroup" aria-label={locked ? "Brand colours" : "Colours"}>
        {colors.map((c) => <button key={c.name} type="button" role="radio" aria-checked={v === c.value} aria-label={c.name} className="ui-color" style={{ background: c.value }} onClick={() => pick(c.value)} />)}
      </div>
      {locked
        ? <p className="ui-hint" style={{ display: "flex", gap: 6, alignItems: "center" }}><IconLock /> Colours come from this deck&apos;s design system.</p>
        : <label className="ui-form-row"><span className="ui-label">Custom</span><Input aria-label="Custom colour, hex" placeholder="#2a5f6a" maxLength={7} /></label>}
    </div>
  );
}
export function ReadOnlyBanner({ role }: { role: "viewer" | "commenter" }) {
  return <Banner icon={<IconEye />}>{role === "viewer" ? "You can view this." : "You can view and comment."} Ask the owner for edit access to change it or to use {AI}.</Banner>;
}
