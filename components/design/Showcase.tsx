"use client";
import { useState } from "react";
import { Wordmark, Mark } from "@/components/brand/Mark";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Dialog, Menu, Popover, Tooltip, ToastButton } from "@/components/ui/overlays";
import { Avatar, AvatarStack, Badge, Kbd, Segmented, Skeleton, Switch } from "@/components/ui/misc";
import { IconDoc, IconPlus, IconSearch } from "@/components/ui/icons";
import * as P from "@/components/doc/parts";

function Block({ title, ids, children, col }: { title: string; ids?: string; children: React.ReactNode; col?: boolean }) {
  return (
    <section style={{ margin: "32px 0" }} aria-label={title}>
      <h3 className="ui-eyebrow" style={{ marginBottom: 8 }}>{title}{ids ? <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}> · {ids}</span> : null}</h3>
      <div className={`ui-demo ${col ? "ui-demo--col" : ""}`}>{children}</div>
    </section>
  );
}
const QUESTIONS: P.Question[] = [
  { id: "audience", prompt: "Who is this for?", options: ["My team", "Leadership", "Customers"] },
  { id: "length", prompt: "How long should it be?", options: ["One page", "Two to three pages"] },
];
const PEOPLE: P.Person[] = [
  { name: "You", email: "you@example.com", role: "owner" },
  { name: "Priya Shah", email: "priya@example.com", role: "editor" },
  { name: "sam@example.com", email: "sam@example.com", role: "viewer", pending: true },
];
const BRAND_COLORS = [
  { name: "Ink", value: "var(--color-text)" }, { name: "Accent", value: "var(--color-accent)" }, { name: "Sand", value: "var(--color-pressed)" },
  { name: "Plum", value: "var(--color-person-4)" }, { name: "Paper", value: "var(--color-raised)" },
];

export function Showcase() {
  const [sel, setSel] = useState("a");
  const [on, setOn] = useState(true);
  const [view, setView] = useState<"all" | "doc" | "deck">("all");
  return (
    <div>
      <Block title="Mark and wordmark (placeholder)"><Mark size={32} title="Page mark" /><Wordmark size={24} /></Block>
      <Block title="Typography" col>
        <div className="ui-h-display">Display 56 serif</div>
        <div className="ui-h-title">Document title 40</div>
        <div className="ui-h1">Heading 1 · 28</div>
        <div className="ui-h2">Heading 2 · 22</div>
        <div className="ui-h3">Heading 3 · 18</div>
        <div>Body 16/26. The first sentence states the point.</div>
        <div className="ui-label">Label 14</div><div className="ui-caption">Caption 13</div>
        <div className="ui-eyebrow">Eyebrow 12</div><div className="ui-code">const code = &quot;mono 13&quot;;</div>
      </Block>
      <Block title="Button" ids="all screens">
        <Button>Primary</Button><Button variant="secondary">Secondary</Button><Button variant="ghost">Ghost</Button><Button variant="danger">Delete</Button>
        <Button variant="icon" aria-label="Add"><IconPlus /></Button><Button disabled>Disabled</Button><Button loading>Saving</Button>
        <Button size="sm">Small</Button><Button size="lg">Large</Button>
      </Block>
      <Block title="Input, Textarea, Select: default, error, disabled">
        <div style={{ display: "grid", gap: 12, width: "min(420px,100%)" }}>
          <Input aria-label="Title" placeholder="Untitled" />
          <div className="ui-form-row"><Input aria-label="Email" defaultValue="priya@" aria-invalid aria-describedby="demo-err" /><p className="ui-error" id="demo-err">Enter a full email address.</p></div>
          <Input aria-label="Locked field" defaultValue="Read only" disabled />
          <Textarea aria-label="Notes" placeholder="Write something" />
          <Select label="Template" value={sel} onValueChange={setSel} options={[{ value: "a", label: "Blank" }, { value: "b", label: "Memo" }, { value: "c", label: "Plan" }]} />
        </div>
      </Block>
      <Block title="Menu, Modal, Popover, Tooltip, Toast">
        <Menu trigger={<Button variant="secondary">Menu</Button>} items={[{ label: "Rename" }, { label: "Duplicate", shortcut: "⌘D" }, "sep", { label: "Delete", disabled: true }]} />
        <Dialog trigger={<Button variant="secondary">Modal</Button>} title="Delete this doc?" description="It is removed for everyone it is shared with."><div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Button variant="secondary">Cancel</Button><Button variant="danger">Delete</Button></div></Dialog>
        <Popover trigger={<Button variant="secondary">Popover</Button>}><span className="ui-caption">Popover content</span></Popover>
        <Tooltip label="Tooltip text"><Button variant="secondary">Hover me</Button></Tooltip>
        <ToastButton label="Toast" message="Saved" />
      </Block>
      <Block title="Avatar, Badge, Kbd, Switch, Segmented, Skeleton">
        <Avatar name="Priya" /><Avatar name="AI" ai /><AvatarStack people={[{ name: "Priya" }, { name: "Sam" }, { name: "Lee" }, { name: "Ana" }]} />
        <Badge>Owner</Badge><Badge tone="accent">AI</Badge><Badge tone="guest">Invited</Badge><Badge tone="success">Saved</Badge><Badge tone="danger">Failed</Badge>
        <Kbd>⌘</Kbd><Kbd>B</Kbd>
        <Switch label="Share by link" checked={on} onCheckedChange={setOn} />
        <Segmented label="Type filter" value={view} onValueChange={setView} options={[{ value: "all", label: "All" }, { value: "doc", label: "Docs" }, { value: "deck", label: "Decks" }]} />
        <div style={{ width: 160 }}><Skeleton h={14} /></div>
      </Block>

      <Block title="Library card and template card" ids="S02, S03">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, width: "100%", alignItems: "start" }}>
          <P.LibraryCard kind="doc" title="Q1 launch plan" meta="Edited 2h ago" />
          <P.LibraryCard kind="deck" title="Board update" meta="Edited yesterday" shared="Priya" />
          <P.TemplateCard name="Memo" blurb="Decision first, then reasons." />
          <P.TemplateCard name="Pitch deck" blurb="Problem, answer, proof, ask." kind="deck" />
        </div>
      </Block>
      <Block title="Empty state and banners" ids="S02, S05, S12" col>
        <P.EmptyState icon={<IconDoc />} title="Nothing here yet" body="Describe what you need and a first draft appears in the editor." action={<Button><IconPlus /> New</Button>} />
        <P.EmptyState icon={<IconSearch />} title="No matches" body="Nothing in your library matches “roadmap”. Check the spelling or clear the filter." />
        <div className="ui-stack" style={{ width: "100%" }}>
          <P.ReadOnlyBanner role="viewer" />
          <P.Banner tone="warning">Reconnecting. Your edits are kept and will sync.</P.Banner>
          <P.Banner tone="error" action={<Button variant="ghost" size="sm">Try again</Button>}>This doc could not be loaded.</P.Banner>
        </div>
      </Block>

      <Block title="Prompt box: hero with Output picker, chat, sending, running, disabled" ids="S02, S04" col>
        <div className="ui-stack" style={{ width: "min(560px,100%)" }}>
          <P.PromptBox hero withOutput placeholder="What do you want to write?" />
          <P.PromptBox />
          <P.PromptBox defaultValue="Add a risks section" sending />
          <P.PromptBox running />
          <P.PromptBox disabled />
        </div>
      </Block>
      <Block title="Chat messages: user, questions, progress, streaming, done, error" ids="S04">
        <P.ChatPanel title="Q1 launch plan" footer={<P.PromptBox running />}>
          <P.ChatMessage role="user">Write a one-page plan for the Q1 launch.</P.ChatMessage>
          <P.ChatMessage role="ai">Two quick questions first.</P.ChatMessage>
          <P.QuestionsCard questions={QUESTIONS} />
          <P.ProgressLine label="Outlined 4 sections" done />
          <P.ProgressLine label="Drafting section 2 of 4: Timeline" />
          <P.ChatMessage role="ai" streaming>Writing the timeline</P.ChatMessage>
        </P.ChatPanel>
        <P.ChatPanel title="Q1 launch plan" footer={<P.PromptBox />}>
          <P.ChatMessage role="user">Make the intro shorter.</P.ChatMessage>
          <P.ChatMessage role="ai" onUndo={() => {}}>Cut the intro from four sentences to two.</P.ChatMessage>
          <P.ChatMessage role="user">Add last year&apos;s revenue.</P.ChatMessage>
          <P.ChatMessage role="error" onRetry={() => {}}>That did not go through. What was written so far is saved.</P.ChatMessage>
        </P.ChatPanel>
      </Block>

      <Block title="Doc: drafting placeholder, AI presence, marks" ids="S05" col>
        <P.AiPresencePill section="Timeline" />
        <div style={{ width: "100%" }}><P.PendingBlock intent="Risks: what could slip, and the fallback" /></div>
        <p style={{ margin: 0 }}>Launch is <span className="ui-hl-comment">on track for March</span>, with <span className="ui-hl-comment" data-active="">two open risks</span>. <span className="ui-ai-mark">This sentence was just rewritten by AI.</span></p>
        <p style={{ margin: 0 }}>Priya is typing here<span className="ui-cursor" data-name="Priya" style={{ ["--cursor" as string]: "var(--color-person-1)", ["--cursor-ink" as string]: "var(--color-on-person)" }} /></p>
      </Block>
      <Block title="Rich-text toolbar, selection menu, Edit with AI, slash menu" ids="S05">
        <P.RichToolbar /><P.SelectionMenu /><P.SelectionMenu canEdit={false} /><P.BlockHandle />
        <P.AiEditComposer quote="We are pleased to announce that the launch moves to March 4." />
        <P.AiEditComposer quote="We are pleased to announce that the launch moves to March 4." busy />
        <P.AiEditComposer quote="Budget and timeline table" error="Select inside one cell, or whole rows." />
        <P.SlashMenu />
      </Block>
      <Block title="Tab bar: one, many, renaming" ids="S05" col>
        <div role="tree" aria-label="Tabs" style={{ width: 232 }}><P.TabItem name="Plan" current /><P.TabItem name="Sources" /><P.TabItem name="Raw data" nested /><P.TabItem name="Notes" renaming /></div>
      </Block>
      <Block title="Table and chart blocks: editing, read-only" ids="S05, S07" col>
        <P.TableBlock /><P.TableBlock readOnly />
        <P.ChartBlock title="Signups grew 14% in March" caption="Source: product analytics, 1 April" />
      </Block>
      <Block title="Comments: badge, pin, cards, composer" ids="S06">
        <div style={{ display: "flex", gap: 8, alignSelf: "flex-start", alignItems: "center" }}><P.CommentBadge count={2} /><P.CommentBadge count={1} state="sent" /><P.CommentBadge count={3} state="resolved" /><P.CommentPin n={1} /></div>
        <div style={{ display: "grid", gap: 12, width: 320, maxWidth: "100%" }}>
          <P.CommentCard author="Priya" time="5m" body="Is this the confirmed date?" active replies={2} />
          <P.CommentCard author="Sam" time="2m" color="var(--color-person-2)" body="@AI make this warmer, keep the numbers." state="sent" />
          <P.CommentCard author="AI" time="now" body="Softened the opening and kept both figures. Changed one sentence." fromAi />
          <P.CommentCard author="Lee" time="1d" color="var(--color-person-4)" body="Moved the budget line." state="resolved" />
        </div>
        <div style={{ display: "grid", gap: 12, width: 320, maxWidth: "100%" }}><P.CommentComposer /><P.CommentComposer canAskAi={false} /></div>
      </Block>

      <Block title="Slide thumbnail rail: selected, dragging, add" ids="S07">
        <P.SlideRail titles={["Board update", "Where we are", "What changed", "The ask"]} current={1} dragging={2} />
        <div style={{ flex: 1, minWidth: 280 }}>
          <P.SlideCanvas notes="Open with the number. Pause before the ask.">
            <P.CanvasElement type="text" state="selected" box={{ x: 6, y: 10, w: 56, h: 22 }}><div className="ui-serif" style={{ fontSize: "clamp(14px, 4cqw, 30px)", fontWeight: 550, lineHeight: 1.15 }}>Signups grew 14% in March</div></P.CanvasElement>
            <P.CanvasElement type="text" box={{ x: 6, y: 40, w: 44, h: 16 }}><div style={{ fontSize: "clamp(9px, 1.9cqw, 15px)", color: "var(--color-text-muted)" }}>Three channels drove the change.</div></P.CanvasElement>
            <P.CanvasElement type="image" label="Photo of the team" state="locked" box={{ x: 66, y: 12, w: 28, h: 40 }}><div style={{ width: "100%", height: "100%", background: "var(--color-sunken)", borderRadius: 4 }} /></P.CanvasElement>
            <P.CanvasElement type="shape" label="Accent bar" state="moving" box={{ x: 6, y: 66, w: 20, h: 10 }}><div style={{ width: "100%", height: "100%", background: "var(--color-accent)", borderRadius: 4 }} /></P.CanvasElement>
            <P.CanvasElement type="chart" label="Signups by channel" state="resizing" box={{ x: 40, y: 62, w: 30, h: 28 }}><div style={{ width: "100%", height: "100%", background: "var(--color-accent-subtle)", borderRadius: 4 }} /></P.CanvasElement>
          </P.SlideCanvas>
        </div>
      </Block>
      <Block title="Colour picker: brand-locked, free" ids="S07, S11">
        <P.ColorPicker colors={BRAND_COLORS} locked /><P.ColorPicker colors={BRAND_COLORS} />
      </Block>

      <Block title="Share dialog: private, shared, blocked" ids="S09">
        <P.ShareDialog people={PEOPLE} title="Q1 launch plan" />
        <div className="ui-card" style={{ width: 480, maxWidth: "100%" }}><P.SharePanel people={PEOPLE.slice(0, 1)} /></div>
        <div className="ui-card" style={{ width: 480, maxWidth: "100%" }}><P.SharePanel people={PEOPLE} link="viewer" error="Sharing outside your workspace is turned off." /></div>
      </Block>
      <Block title="Export menu: doc, deck; idle, working, done, error" ids="S10">
        <P.ExportMenu kind="doc" />
        <P.ExportList kind="doc" /><P.ExportList kind="doc" state={{ format: "docx", status: "working" }} />
        <P.ExportList kind="deck" state={{ format: "pptx", status: "done" }} /><P.ExportList kind="deck" state={{ format: "pdf", status: "error" }} />
      </Block>
      <Block title="Change attribution" ids="S13" col>
        <P.AttributionList changes={[{ who: "AI", ai: true, askedBy: "Priya", what: "rewrote the intro", when: "2m ago" }, { who: "Priya", what: "edited Timeline", when: "1h ago" }, { who: "AI", ai: true, askedBy: "you", what: "drafted 4 sections", when: "Yesterday" }]} />
      </Block>
    </div>
  );
}
