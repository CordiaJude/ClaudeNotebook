// Generates styles/tokens.css and lib/tokens.generated.ts from replica/design/tokens.json.
// Usage: pnpm tokens            (write)      pnpm tokens --check   (fail if the files are out of date)
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const SRC = path.join(root, "replica/design/tokens.json");
const CSS = path.join(root, "styles/tokens.css");
const TS = path.join(root, "lib/tokens.generated.ts");

export function build(tokens) {
  const { color, font, type, radius, shadow, motion, layout } = tokens;
  const themeColors = (t) => [
    ...Object.entries(color[t]).map(([k, v]) => `--color-${k}: ${v};`),
    `--color-overlay: ${color.overlay[t]};`,
    `--color-selection: ${color.selection[t]};`,
    ...Object.entries(shadow[t]).map(([k, v]) => `--shadow-${k}: ${v};`),
  ];
  const lines = (arr, indent = "  ") => arr.map((l) => indent + l).join("\n");
  const theme = [
    "--color-*: initial;",
    "--text-*: initial;",
    "--radius-*: initial;",
    "--shadow-*: initial;",
    ...themeColors("light"),
    `--font-serif: ${font.serif};`,
    `--font-sans: ${font.sans};`,
    `--font-mono: ${font.mono};`,
    ...Object.entries(type).flatMap(([k, v]) => [
      `--text-${k}: ${v.size}px;`,
      `--text-${k}--line-height: ${v.line}px;`,
      `--text-${k}--font-weight: ${v.weight};`,
    ]),
    ...Object.entries(radius).map(([k, v]) => `--radius-${k}: ${v}px;`),
    `--ease-out: ${motion.ease};`,
    `--duration-fast: ${motion.fast};`,
    `--duration-base: ${motion.base};`,
    `--duration-slow: ${motion.slow};`,
    ...Object.entries(layout).filter(([, v]) => typeof v === "number").map(([k, v]) => `--layout-${k}: ${v}px;`),
  ];
  const css = `/* GENERATED from replica/design/tokens.json by scripts/build-tokens.mjs. Do not edit: change the JSON, run \`pnpm tokens\`. */
/* Tailwind v4 theme: every role is a utility (bg-surface, text-text-muted, border-border, rounded-md, shadow-md, font-serif). */
@theme static {
${lines(theme)}
}

:root, [data-theme="light"] {
  color-scheme: light;
${lines(themeColors("light"))}
}

[data-theme="dark"] {
  color-scheme: dark;
${lines(themeColors("dark"))}
}
`;
  const ts = `// GENERATED from replica/design/tokens.json by scripts/build-tokens.mjs. Do not edit.
export const TOKENS = ${JSON.stringify({ color: { light: color.light, dark: color.dark }, roles: tokens._roles, font: { serif: font.serif, sans: font.sans, mono: font.mono }, type, space: tokens.space, radius, shadow, motion, layout }, null, 2)} as const;
export type ColorRole = keyof typeof TOKENS.color.light;
`;
  return { css, ts };
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const { css, ts } = build(JSON.parse(readFileSync(SRC, "utf8")));
  if (process.argv.includes("--check")) {
    const stale = [[CSS, css], [TS, ts]].filter(([f, want]) => readFileSync(f, "utf8") !== want).map(([f]) => path.relative(root, f));
    if (stale.length) { console.error(`Out of date: ${stale.join(", ")}. Run: pnpm tokens`); process.exit(1); }
    console.log("tokens: up to date");
  } else {
    writeFileSync(CSS, css); writeFileSync(TS, ts);
    console.log("tokens: wrote styles/tokens.css and lib/tokens.generated.ts");
  }
}
