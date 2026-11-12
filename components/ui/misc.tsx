"use client";
import * as Sw from "@radix-ui/react-switch";
import * as TG from "@radix-ui/react-toggle-group";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export const PEOPLE_COLORS = ["var(--cn-heather)", "var(--cn-cactus)", "var(--cn-peach)", "var(--cn-brand-blue)", "var(--cn-mineral)"] as const;

export function Avatar({ name, color = PEOPLE_COLORS[0] }: { name: string; color?: string }) {
  return <span className="cn-avatar" style={{ background: color }} title={name} role="img" aria-label={name}>{name.slice(0, 1).toUpperCase()}</span>;
}
export function AvatarStack({ people }: { people: { name: string }[] }) {
  return <span className="cn-avatars">{people.map((p, i) => <Avatar key={p.name} name={p.name} color={PEOPLE_COLORS[i % PEOPLE_COLORS.length]} />)}</span>;
}
export function Badge({ tone, children }: { tone?: "accent" | "guest"; children: ReactNode }) {
  return <span className={`cn-badge ${tone ? `cn-badge--${tone}` : ""}`}>{children}</span>;
}
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="cn-kbd">{children}</kbd>;
}
export function Skeleton({ w = "100%", h = 14, style }: { w?: string | number; h?: number; style?: CSSProperties }) {
  return <div className="cn-skel" style={{ width: w, height: h, ...style }} aria-hidden />;
}
export function Switch({ checked, onCheckedChange, label }: { checked?: boolean; onCheckedChange?: (v: boolean) => void; label: string }) {
  return (
    <Sw.Root className="cn-switch" checked={checked} onCheckedChange={onCheckedChange} aria-label={label}>
      <Sw.Thumb className="cn-switch-thumb" />
    </Sw.Root>
  );
}
export function Segmented<T extends string>({ value, onValueChange, options, label }: {
  value: T; onValueChange: (v: T) => void; options: { value: T; label: string }[]; label: string;
}) {
  return (
    <TG.Root type="single" className="cn-seg" value={value} onValueChange={(v) => v && onValueChange(v as T)} aria-label={label}>
      {options.map((o) => <TG.Item key={o.value} value={o.value} className="cn-seg-item">{o.label}</TG.Item>)}
    </TG.Root>
  );
}
export function Div(p: HTMLAttributes<HTMLDivElement>) { return <div {...p} />; }
