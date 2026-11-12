"use client";
import { useState, type ReactNode } from "react";
import { Avatar, Badge, Kbd, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Popover, Dialog, Menu } from "@/components/ui/overlays";
import { Select } from "@/components/ui/select";
import { IconBold, IconComment, IconDetached, IconGrip, IconItalic, IconLink, IconSparkle, IconStop } from "@/components/ui/icons";
import { Input } from "@/components/ui/field";

/* ---------- Chips ---------- */
export function MentionChip({ name }: { name: string }) { return <span className="cn-chip">@{name}</span>; }
export function DateChip({ iso }: { iso: string }) { return <span className="cn-chip">{iso}</span>; }
export function DropdownChip({ label, options }: { label: string; options: string[] }) {
  const [v, setV] = useState(options[0]!);
  return (
    <Menu trigger={<button className="cn-chip" aria-label={`${label}: ${v}`}>{v} ▾</button>} items={options.map((o) => ({ label: o, onSelect: () => setV(o) }))} />
  );
}
export function EmbedCard({ title, caption, children }: { title: string; caption: string; children?: ReactNode }) {
  return (
    <figure className="cn-chip cn-chip--embed" style={{ margin: 0, display: "grid", gap: 8 }}>
      <div role="img" aria-label={title} style={{ width: "100%" }}>{children}</div>
      <figcaption className="cn-caption">{caption}</figcaption>
    </figure>
  );
}

/* ---------- Pending ---------- */
export function PendingBlock({ intent }: { intent: string }) {
  return (
    <div className="cn-pending" role="status" aria-label={`Pending: ${intent}`}>
      <Skeleton w="38%" h={18} />
      <Skeleton w="92%" /><Skeleton w="78%" />
      <span className="cn-pending-intent">{intent}</span>
    </div>
  );
}

/* ---------- Slash menu / toolbar / handle ---------- */
const SLASH = ["Heading 1", "Heading 2", "Heading 3", "Bullet list", "Numbered list", "Task list", "Table", "Quote", "Divider", "Code block", "Image", "Chart", "Diagram"];
export function SlashMenu() {
  return (
    <div className="cn-pop" role="listbox" aria-label="Insert block" style={{ width: 240 }}>
      {SLASH.slice(0, 7).map((s, i) => (
        <div key={s} role="option" aria-selected={i === 0} className="cn-item" data-highlighted={i === 0 ? "" : undefined}>{s}</div>
      ))}
    </div>
  );
}
export function FloatingToolbar() {
  return (
    <div className="cn-toolbar" role="toolbar" aria-label="Formatting">
      <Button variant="icon" aria-label="Bold"><IconBold /></Button>
      <Button variant="icon" aria-label="Italic"><IconItalic /></Button>
      <Button variant="icon" aria-label="Link"><IconLink /></Button>
      <Button variant="icon" aria-label="Comment"><IconComment /></Button>
      <Button variant="ghost" size="sm"><IconSparkle /> Ask Claude to edit</Button>
    </div>
  );
}
export function BlockHandle() {
  return <button className="cn-btn cn-btn--ghost cn-btn--icon" aria-label="Drag block or open block menu" style={{ cursor: "grab" }}><IconGrip /></button>;
}

/* ---------- Tabs tray ---------- */
export function TabTrayItem({ name, current, nested }: { name: string; current?: boolean; nested?: boolean }) {
  return (
    <div className={`cn-tab ${nested ? "cn-tab--nested" : ""}`} aria-current={current ? "true" : undefined} role="treeitem" aria-selected={current ? true : false} tabIndex={0}>
      <span className="cn-handle" aria-hidden><IconGrip /></span>
      <span style={{ flex: 1 }}>{name}</span>
    </div>
  );
}

/* ---------- Table + 7-color cells ---------- */
export const CELL_COLORS = ["gray", "red", "orange", "yellow", "green", "blue", "purple"] as const;
export function TableDemo() {
  const [bg, setBg] = useState<string | null>("green");
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <table className="cn-table">
        <thead><tr><th>Risk</th><th>Owner</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td>Vendor slips 2 weeks</td><td>Priya</td><td style={{ background: bg ? `var(--cn-cell-${bg})` : undefined }}><DropdownChip label="Status" options={["On track", "At risk", "Blocked"]} /></td></tr>
          <tr><td>Budget cut of 10%</td><td>Sam</td><td>—</td></tr>
        </tbody>
      </table>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Popover trigger={<Button variant="secondary" size="sm">Cell color</Button>}>
          <div className="cn-swatches" role="group" aria-label="Cell color">
            {CELL_COLORS.map((c) => (
              <button key={c} className="cn-swatch" aria-label={c} aria-pressed={bg === c} style={{ background: `var(--cn-cell-${c})` }} onClick={() => setBg(bg === c ? null : c)} />
            ))}
          </div>
        </Popover>
        <Menu trigger={<Button variant="secondary" size="sm">Table menu</Button>} items={[{ label: "Insert row below" }, { label: "Insert column right" }, { label: "Merge cells" }, { label: "Split cell" }, "sep", { label: "Delete row" }, { label: "Delete column" }]} />
      </div>
    </div>
  );
}

/* ---------- Comments ---------- */
export function CommentCard({ author, time, body, replies = 0, active, detached, fromClaude }: {
  author: string; time: string; body: string; replies?: number; active?: boolean; detached?: boolean; fromClaude?: boolean;
}) {
  return (
    <article className={`cn-card ${active ? "cn-card--active" : ""}`} aria-label={`Comment by ${author}`}>
      <div className="cn-card-head">
        <Avatar name={author} color={fromClaude ? "var(--cn-accent)" : undefined} />
        <strong>{author}</strong><span className="cn-card-meta">{time}</span>
        {detached ? <span className="cn-detached"><IconDetached /> Detached</span> : null}
      </div>
      <p className="cn-card-body">{body}</p>
      {replies > 0 ? <button className="cn-btn cn-btn--ghost cn-btn--sm" style={{ justifySelf: "start", padding: "0 8px" }}>Show {replies} replies</button> : null}
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="secondary" size="sm">Reply</Button><Button variant="ghost" size="sm">Resolve</Button>
      </div>
    </article>
  );
}
export function CommentComposer() {
  const [ask, setAsk] = useState(false);
  return (
    <div className="cn-card">
      <Textarea aria-label="Comment" placeholder="Add a comment. @Claude to ask for help." />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 14 }}>
          <input type="checkbox" checked={ask} onChange={(e) => setAsk(e.target.checked)} /> Ask Claude
        </label>
        <span style={{ flex: 1 }} /><Button variant="ghost" size="sm">Cancel</Button><Button size="sm">Comment</Button>
      </div>
    </div>
  );
}
export function SuggestionCard() {
  return (
    <article className="cn-card" aria-label="Suggestion by Claude">
      <div className="cn-card-head"><Avatar name="Claude" color="var(--cn-accent)" /><strong>Claude</strong><span className="cn-card-meta">2m ago</span></div>
      <p className="cn-card-body"><span className="cn-del">We are pleased to announce that</span> <span className="cn-ins">Launch moves to</span> March 4.</p>
      <div style={{ display: "flex", gap: 8 }}><Button size="sm">Accept</Button><Button variant="secondary" size="sm">Reject</Button></div>
    </article>
  );
}

/* ---------- Versions / share / export ---------- */
export function VersionList() {
  const items = [{ t: "Today 14:02", w: "Before Claude edit" }, { t: "Today 11:30", w: "Priya" }, { t: "Yesterday", w: "Auto-save" }];
  const [cur, setCur] = useState(0);
  return (
    <div style={{ display: "grid", gap: 2 }}>
      <ul aria-label="Versions" style={{ display: "grid", gap: 2, listStyle: "none", margin: 0, padding: 0 }}>
        {items.map((v, i) => (
          <li key={v.t}>
            <button className="cn-version" aria-current={cur === i ? "true" : undefined} onClick={() => setCur(i)} style={{ width: "100%", border: 0, background: "none", font: "inherit", color: "inherit", textAlign: "left" }}>
              <span>{v.t}</span><span className="cn-card-meta">{v.w}</span>
            </button>
          </li>
        ))}
      </ul>
      <Button variant="secondary" size="sm" style={{ justifySelf: "start", marginTop: 8 }}>Restore this version</Button>
    </div>
  );
}
export function ShareDialog() {
  const [role, setRole] = useState("editor");
  const roles = ["owner", "editor", "commenter", "viewer"].map((r) => ({ value: r, label: r[0]!.toUpperCase() + r.slice(1) }));
  return (
    <Dialog trigger={<Button>Share</Button>} title="Share" description="People with access can open this notebook.">
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 8 }}><Input aria-label="Add people" placeholder="Name or email" /><Select label="Role" value={role} onValueChange={setRole} options={roles.slice(1)} /></div>
        <div className="cn-card-head"><Avatar name="You" /><span style={{ flex: 1 }}>You</span><Badge>Owner</Badge></div>
        <div className="cn-card-head"><Avatar name="Outside Person" color="var(--cn-peach)" /><span style={{ flex: 1 }}>outside@example.com</span><Badge tone="guest">Guest</Badge><Badge>Viewer</Badge></div>
      </div>
    </Dialog>
  );
}
export function ExportMenu() {
  return <Menu trigger={<Button variant="secondary">Export</Button>} items={[{ label: "Word (.docx)" }, { label: "PDF" }, { label: "Markdown" }]} />;
}

/* ---------- Claude presence / Ask Claude panel / template ---------- */
export function ClaudePresencePill({ section }: { section: string }) {
  return <span className="cn-presence" role="status" aria-live="polite"><span className="cn-dot" />Claude is editing · {section}</span>;
}
export function AskClaudePanel() {
  return (
    <section className="cn-panel" aria-label="Ask Claude">
      <div className="cn-panel-head"><strong>Ask Claude</strong></div>
      <div className="cn-msgs" aria-live="polite">
        <div className="cn-msg cn-msg--user">Write a one-page plan for the Q1 launch.</div>
        <div className="cn-msg cn-msg--claude">Plan is open. Filling Risks now.</div>
      </div>
      <div className="cn-composer">
        <Textarea aria-label="Message Claude" placeholder="Ask Claude to write or edit…" />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="cn-card-meta"><Kbd>⌘</Kbd> <Kbd>K</Kbd> to focus</span>
          <span style={{ display: "flex", gap: 8 }}><Button variant="secondary" size="sm"><IconStop /> Stop</Button><Button size="sm">Send</Button></span>
        </div>
      </div>
    </section>
  );
}
export function TemplateCard({ name, blurb }: { name: string; blurb: string }) {
  return <button className="cn-template"><div className="cn-h3">{name}</div><div className="cn-caption">{blurb}</div></button>;
}
