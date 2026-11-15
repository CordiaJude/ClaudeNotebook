/* A design system: six colours and two fonts that every deck follows. Fonts come from a fixed list of open-licence
   families that the app hosts itself, so a deck looks the same for everyone who opens it. */
import type { ColorRole } from "./types";

export const FONTS = {
  newsreader: { label: "Newsreader", kind: "serif", css: '"Newsreader Variable", Newsreader, Georgia, serif', office: "Newsreader", basic: "Georgia" },
  lora: { label: "Lora", kind: "serif", css: '"Lora Variable", Lora, Georgia, serif', office: "Lora", basic: "Georgia" },
  fraunces: { label: "Fraunces", kind: "serif", css: '"Fraunces Variable", Fraunces, Georgia, serif', office: "Fraunces", basic: "Georgia" },
  "source-serif": { label: "Source Serif 4", kind: "serif", css: '"Source Serif 4 Variable", "Source Serif 4", Georgia, serif', office: "Source Serif 4", basic: "Georgia" },
  inter: { label: "Inter", kind: "sans", css: '"Inter Variable", Inter, Arial, sans-serif', office: "Inter", basic: "Arial" },
  "dm-sans": { label: "DM Sans", kind: "sans", css: '"DM Sans Variable", "DM Sans", Arial, sans-serif', office: "DM Sans", basic: "Arial" },
  "work-sans": { label: "Work Sans", kind: "sans", css: '"Work Sans Variable", "Work Sans", Arial, sans-serif', office: "Work Sans", basic: "Arial" },
  manrope: { label: "Manrope", kind: "sans", css: '"Manrope Variable", Manrope, Arial, sans-serif', office: "Manrope", basic: "Arial" },
} as const;
export type FontId = keyof typeof FONTS;
export const FONT_IDS = Object.keys(FONTS) as FontId[];

export type DesignSystem = { name: string; colors: Record<ColorRole, string>; fonts: { heading: FontId; body: FontId }; isDefault?: boolean; updatedAt?: string };
export const COLOR_LABELS: Record<ColorRole, { label: string; help: string }> = {
  background: { label: "Background", help: "Behind most slides" },
  surface: { label: "Second background", help: "Quote slides and panels" },
  text: { label: "Text", help: "Titles and body text" },
  muted: { label: "Quiet text", help: "Subtitles and captions" },
  accent: { label: "Accent", help: "Section slides, bars and big numbers" },
  onAccent: { label: "Text on accent", help: "Words on a section slide" },
};
export const DEFAULT_DESIGN: DesignSystem = {
  name: "Draftly default", isDefault: true,
  colors: { background: "#fbfaf7", surface: "#efebe3", text: "#201e1b", muted: "#5f5a52", accent: "#2a5f6a", onAccent: "#ffffff" },
  fonts: { heading: "newsreader", body: "inter" },
};

const HEX = /^#[0-9a-f]{6}$/i;
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
/** WCAG contrast ratio between two #rrggbb colours, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}
/** The pairs a deck actually puts together, and the least contrast each needs to be readable from the back of a room. */
export const PAIRS: { fg: ColorRole; bg: ColorRole; min: number }[] = [
  { fg: "text", bg: "background", min: 4.5 }, { fg: "text", bg: "surface", min: 4.5 },
  { fg: "muted", bg: "background", min: 4.5 }, { fg: "muted", bg: "surface", min: 4.5 },
  { fg: "accent", bg: "background", min: 3 }, { fg: "onAccent", bg: "accent", min: 4.5 },
];
export type Check = { fg: ColorRole; bg: ColorRole; ratio: number; min: number; ok: boolean };
export const checkContrast = (colors: Record<ColorRole, string>): Check[] => PAIRS.map((p) => { const ratio = contrast(colors[p.fg], colors[p.bg]); return { ...p, ratio, ok: ratio >= p.min }; });

/** Checks a design system someone typed in. Returns the cleaned value, or what is wrong in words a person can act on. */
export function validateDesign(input: unknown): { ok: true; design: DesignSystem } | { ok: false; errors: string[] } {
  const v = (input ?? {}) as Partial<DesignSystem>;
  const errors: string[] = [];
  const colors = {} as Record<ColorRole, string>;
  for (const role of Object.keys(COLOR_LABELS) as ColorRole[]) {
    const c = String(v.colors?.[role] ?? "").trim().toLowerCase();
    if (!HEX.test(c)) errors.push(`${COLOR_LABELS[role].label} needs a colour like #2a5f6a.`); else colors[role] = c;
  }
  const heading = v.fonts?.heading, body = v.fonts?.body;
  if (!heading || !(heading in FONTS)) errors.push("Choose a heading font from the list.");
  if (!body || !(body in FONTS)) errors.push("Choose a body font from the list.");
  if (errors.length) return { ok: false, errors };
  for (const c of checkContrast(colors)) if (!c.ok) errors.push(`${COLOR_LABELS[c.fg].label} on ${COLOR_LABELS[c.bg].label.toLowerCase()} has a contrast of ${c.ratio}:1. It needs at least ${c.min}:1 to be readable.`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, design: { name: String(v.name ?? "").trim().slice(0, 60) || "My design system", colors, fonts: { heading: heading as FontId, body: body as FontId } } };
}
