"use client";
import * as Sw from "@radix-ui/react-switch";
import * as TG from "@radix-ui/react-toggle-group";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export const PEOPLE_COLORS = [1, 2, 3, 4, 5, 6].map((n) => `var(--color-person-${n})`);

export function Avatar({ name, color = PEOPLE_COLORS[0], ai }: { name: string; color?: string; ai?: boolean }) {
  return <span className={`ui-avatar ${ai ? "ui-avatar--ai" : ""}`} style={ai ? undefined : { background: color }} title={name} role="img" aria-label={name}>{name.slice(0, 1).toUpperCase()}</span>;
}
export function AvatarStack({ people }: { people: { name: string }[] }) {
  return <span className="ui-avatars">{people.map((p, i) => <Avatar key={p.name} name={p.name} color={PEOPLE_COLORS[i % PEOPLE_COLORS.length]} />)}</span>;
}
export function Badge({ tone, children }: { tone?: "accent" | "guest" | "success" | "danger"; children: ReactNode }) {
  return <span className={`ui-badge ${tone ? `ui-badge--${tone}` : ""}`}>{children}</span>;
}
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ui-kbd">{children}</kbd>;
}
export function Skeleton({ w = "100%", h = 14, style }: { w?: string | number; h?: number; style?: CSSProperties }) {
  return <div className="ui-skel" style={{ width: w, height: h, ...style }} aria-hidden />;
}
export function Switch({ checked, onCheckedChange, label }: { checked?: boolean; onCheckedChange?: (v: boolean) => void; label: string }) {
  return (
    <Sw.Root className="ui-switch" checked={checked} onCheckedChange={onCheckedChange} aria-label={label}>
      <Sw.Thumb className="ui-switch-thumb" />
    </Sw.Root>
  );
}
export function Segmented<T extends string>({ value, onValueChange, options, label }: {
  value: T; onValueChange: (v: T) => void; options: { value: T; label: string }[]; label: string;
}) {
  return (
    <TG.Root type="single" className="ui-seg" value={value} onValueChange={(v) => v && onValueChange(v as T)} aria-label={label}>
      {options.map((o) => <TG.Item key={o.value} value={o.value} className="ui-seg-item">{o.label}</TG.Item>)}
    </TG.Root>
  );
}
export function Div(p: HTMLAttributes<HTMLDivElement>) { return <div {...p} />; }
