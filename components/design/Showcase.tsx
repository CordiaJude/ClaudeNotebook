"use client";
import { useState } from "react";
import { Wordmark, Mark } from "@/components/brand/Mark";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Dialog, Menu, Popover, Tooltip, ToastButton } from "@/components/ui/overlays";
import { Avatar, AvatarStack, Badge, Kbd, Segmented, Skeleton, Switch } from "@/components/ui/misc";
import * as P from "@/components/doc/parts";

function Block({ title, children, col }: { title: string; children: React.ReactNode; col?: boolean }) {
  return (
    <section style={{ margin: "32px 0" }} aria-label={title}>
      <h3 className="cn-eyebrow" style={{ marginBottom: 8 }}>{title}</h3>
      <div className={`cn-demo ${col ? "cn-demo--col" : ""}`}>{children}</div>
    </section>
  );
}

export function Showcase() {
  const [mode, setMode] = useState<"editing" | "suggesting" | "viewing">("editing");
  const [sel, setSel] = useState("a");
  const [on, setOn] = useState(true);
  return (
    <div>
      <Block title="Mark & wordmark"><Mark size={32} title="Notebook mark" /><Wordmark size={24} /></Block>
      <Block title="Typography" col>
        <div className="cn-h-display" style={{ fontSize: 48 }}>Display serif 330</div>
        <div className="cn-h-title">Doc title 40/340</div>
        <div className="cn-h1">Heading 1 · 32</div>
        <div className="cn-h2">Heading 2 · 24</div>
        <div className="cn-h3">Heading 3 · sans 18/600</div>
        <div>Body 16/1.6. The first sentence states the point.</div>
        <div className="cn-label">UI label 15</div><div className="cn-caption">Caption 14</div>
        <div className="cn-eyebrow">Eyebrow 12</div><div className="cn-code">const code = &quot;mono 14&quot;;</div>
      </Block>
      <Block title="Button"><Button>Primary</Button><Button variant="secondary">Secondary</Button><Button variant="ghost">Ghost</Button><Button variant="danger">Danger</Button><Button variant="icon" aria-label="Add">+</Button><Button disabled>Disabled</Button></Block>
      <Block title="Input, Textarea, Select">
        <div style={{ display: "grid", gap: 12, width: "min(420px,100%)" }}>
          <Input aria-label="Title" placeholder="Untitled" /><Textarea aria-label="Notes" placeholder="Write something" />
          <Select label="Template" value={sel} onValueChange={setSel} options={[{ value: "a", label: "Blank" }, { value: "b", label: "Memo" }, { value: "c", label: "Plan" }]} />
        </div>
      </Block>
      <Block title="Menu, Dialog, Popover, Tooltip, Toast">
        <Menu trigger={<Button variant="secondary">Menu</Button>} items={[{ label: "Rename" }, { label: "Duplicate", shortcut: "⌘D" }, "sep", { label: "Delete", disabled: true }]} />
        <Dialog trigger={<Button variant="secondary">Dialog</Button>} title="Delete tab?" description="Sub-tabs move to the top level."><div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Button variant="secondary">Cancel</Button><Button variant="danger">Delete</Button></div></Dialog>
        <Popover trigger={<Button variant="secondary">Popover</Button>}><span className="cn-caption">Popover content</span></Popover>
        <Tooltip label="Tooltip text"><Button variant="secondary">Hover me</Button></Tooltip>
        <ToastButton label="Toast" message="Saved" />
      </Block>
      <Block title="Avatar, presence stack, Badge, Kbd, Switch, Segmented, Skeleton">
        <Avatar name="Priya" /><AvatarStack people={[{ name: "Priya" }, { name: "Sam" }, { name: "Lee" }]} />
        <Badge>Owner</Badge><Badge tone="accent">Claude</Badge><Badge tone="guest">Guest</Badge>
        <Kbd>⌘</Kbd><Kbd>B</Kbd>
        <Switch label="Ask Claude" checked={on} onCheckedChange={setOn} />
        <Segmented label="Mode" value={mode} onValueChange={setMode} options={[{ value: "editing", label: "Editing" }, { value: "suggesting", label: "Suggesting" }, { value: "viewing", label: "Viewing" }]} />
        <div style={{ width: 200 }}><Skeleton h={14} /></div>
      </Block>
      <Block title="Tab tray item" col>
        <div role="tree" aria-label="Tabs" style={{ width: 240 }}><P.TabTrayItem name="Plan" current /><P.TabTrayItem name="Sources" /><P.TabTrayItem name="Raw data" nested /></div>
      </Block>
      <Block title="Chips: mention, date, dropdown, embed" col>
        <p style={{ margin: 0 }}>As of <P.DateChip iso="2026-11-12" /> · <P.MentionChip name="Priya" /> · Status <P.DropdownChip label="Status" options={["On track", "At risk", "Blocked"]} /></p>
        <div style={{ width: "100%" }}><P.EmbedCard title="Revenue grew 14% to $2.1M" caption="Source: finance export, 2026-11-01"><div className="cn-skel" style={{ height: 80 }} /></P.EmbedCard></div>
      </Block>
      <Block title="Pending block" col><div style={{ width: "100%" }}><P.PendingBlock intent="Risks: what could slip and the fallback" /></div></Block>
      <Block title="Doc marks: comment highlight, suggestion, task, cursor" col>
        <p style={{ margin: 0 }}>Launch is <span className="cn-hl-comment">on track for March</span>, with <span className="cn-hl-comment" data-active="">two open risks</span>.</p>
        <p style={{ margin: 0 }}><span className="cn-del">Old wording</span> <span className="cn-ins">new wording</span></p>
        <p style={{ margin: 0 }} className="cn-task-done">Done task (struck, 55% opacity)</p>
        <p style={{ margin: 0 }}>Typing here<span className="cn-cursor" data-name="Claude" /></p>
      </Block>
      <Block title="Slash menu & floating toolbar"><P.SlashMenu /><P.FloatingToolbar /><P.BlockHandle /></Block>
      <Block title="Table, cell colors (7), table menu" col><div style={{ width: "100%" }}><P.TableDemo /></div></Block>
      <Block title="Comment card, composer, suggestion card">
        <div style={{ display: "grid", gap: 12, width: 320, maxWidth: "100%" }}>
          <P.CommentCard author="Priya" time="5m" body="Is this the confirmed date?" active replies={2} />
          <P.CommentCard author="Claude" time="now" body="Confirmed in the vendor email dated Nov 10." fromClaude />
          <P.CommentCard author="Sam" time="1d" body="Moved the budget line." detached />
          <P.CommentComposer /><P.SuggestionCard />
        </div>
      </Block>
      <Block title="Version list, Share dialog, Export menu"><div style={{ width: 280 }}><P.VersionList /></div><P.ShareDialog /><P.ExportMenu /></Block>
      <Block title="Claude presence pill"><P.ClaudePresencePill section="Risks" /></Block>
      <Block title="Ask Claude panel"><P.AskClaudePanel /></Block>
      <Block title="Template card"><P.TemplateCard name="Memo" blurb="Decision first, then reasons." /><P.TemplateCard name="Plan" blurb="Goals, steps, risks." /></Block>
    </div>
  );
}
