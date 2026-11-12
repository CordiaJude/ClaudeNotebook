"use client";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useNotebook } from "./context";
import { Menu, Popover } from "@/components/ui/overlays";
import { Input } from "@/components/ui/field";
import { PendingBlock } from "@/components/doc/parts";

const chipProps = { contentEditable: false, suppressContentEditableWarning: true } as const;

export function MentionChipView({ node }: NodeViewProps) {
  const ctx = useNotebook();
  const router = useRouter();
  const { kind, ref, label } = node.attrs as { kind: "user" | "tab" | "notebook"; ref: string | null; label: string };
  const live =
    kind === "tab" ? ctx.tabs.find((t) => t.id === ref)?.name :
    kind === "notebook" ? ctx.notebooks.find((n) => n.id === ref)?.title :
    ctx.members.find((m) => m.id === ref)?.name;
  const text = live ?? label ?? "Unknown";
  const go = () => { if (kind === "tab" && ref) ctx.openTab(ref); else if (kind === "notebook" && ref) router.push(`/n/${ref}`); };
  return (
    <NodeViewWrapper as="span" {...chipProps} style={{ display: "inline" }}>
      {kind === "user"
        ? <span className="cn-chip" data-kind="user">@{text}</span>
        : <button type="button" className="cn-chip" data-kind={kind} onClick={go} aria-label={`Open ${kind}: ${text}`}>↗ {text}</button>}
    </NodeViewWrapper>
  );
}

export function DateChipView({ node, updateAttributes }: NodeViewProps) {
  const { canEdit } = useNotebook();
  const value = (node.attrs.value as string | null) ?? "";
  const chip = <span className="cn-chip" data-chip-date>{value || "Pick a date"}</span>;
  return (
    <NodeViewWrapper as="span" {...chipProps} style={{ display: "inline" }}>
      {canEdit ? (
        <Popover trigger={<button type="button" className="cn-chip" aria-label={`Date ${value || "not set"}. Change`}>{value || "Pick a date"}</button>}>
          <Input type="date" aria-label="Date" value={value} onChange={(e) => updateAttributes({ value: e.target.value || null })} />
        </Popover>
      ) : chip}
    </NodeViewWrapper>
  );
}

export function DropdownChipView({ node, updateAttributes }: NodeViewProps) {
  const { enums, canEdit } = useNotebook();
  const { enumId, index } = node.attrs as { enumId: string | null; index: number | null };
  const en = enums.find((e) => e.id === enumId);
  const opt = en && index != null ? en.options[index] : undefined;
  const label = !en ? "Missing list" : opt ? `${opt.name}${opt.removed ? " (removed)" : ""}` : "Select…";
  const items = en ? en.options.map((o, i) => ({ o, i })).filter(({ o }) => !o.removed).map(({ o, i }) => ({ label: o.name, onSelect: () => updateAttributes({ index: i }) })) : [];
  return (
    <NodeViewWrapper as="span" {...chipProps} style={{ display: "inline" }}>
      {canEdit && en
        ? <Menu trigger={<button type="button" className="cn-chip" aria-label={`${en.name}: ${label}`} data-enum={en.name}>{label} ▾</button>} items={items} />
        : <span className="cn-chip">{label}</span>}
    </NodeViewWrapper>
  );
}

export function BylineView({ node }: NodeViewProps) {
  const { asof, authorName } = node.attrs as { asof: string | null; authorName: string | null };
  return (
    <NodeViewWrapper className="cn-byline" {...chipProps}>
      <span className="cn-chip" data-byline-date>{asof ?? "—"}</span>
      <span aria-hidden> · </span>
      <span className="cn-chip" data-byline-author>@{authorName ?? "Unknown"}</span>
    </NodeViewWrapper>
  );
}

export function PendingView({ node }: NodeViewProps) {
  return <NodeViewWrapper {...chipProps}><PendingBlock intent={String(node.attrs.intent ?? "")} /></NodeViewWrapper>;
}

export function EmbedView({ node, updateAttributes }: NodeViewProps) {
  const { canEdit } = useNotebook();
  const [cap, setCap] = useState<string | null>(null);
  const caption = String(node.attrs.caption ?? "");
  return (
    <NodeViewWrapper {...chipProps}>
      <figure className="cn-embed" aria-label={caption || "Embedded chart or diagram"}>
        <div className="cn-embed-body cn-caption">Chart or diagram (rendering arrives with widgets)</div>
        {canEdit
          ? <input className="cn-embed-caption" aria-label="Caption" value={cap ?? caption} placeholder="Caption / source" onChange={(e) => setCap(e.target.value)} onBlur={() => { if (cap !== null) updateAttributes({ caption: cap }); setCap(null); }} />
          : <figcaption className="cn-caption">{caption}</figcaption>}
      </figure>
    </NodeViewWrapper>
  );
}
