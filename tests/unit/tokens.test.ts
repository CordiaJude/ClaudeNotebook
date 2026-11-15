import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs build script, no types
import { build } from "../../scripts/build-tokens.mjs";

const root = path.join(import.meta.dirname, "../..");
const tokens = JSON.parse(readFileSync(path.join(root, "replica/design/tokens.json"), "utf8"));

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const ratio = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi! + 0.05) / (lo! + 0.05); };
const colour = (key: string): string => { const [theme, ...role] = key.split("-"); return tokens.color[theme!][role.join("-")]; };

describe("design tokens", () => {
  it("light and dark define exactly the same roles", () => {
    expect(Object.keys(tokens.color.dark)).toEqual(Object.keys(tokens.color.light));
  });
  it("every listed text/background pair meets WCAG AA (4.5 text, 3 for UI parts)", () => {
    const failing = (tokens.pairs as string[][])
      .map(([fg, bg, size]) => ({ fg, bg, need: size === "ui" || size === "large" ? 3 : 4.5, got: ratio(colour(fg!), colour(bg!)) }))
      .filter((p) => !(p.got >= p.need))
      .map((p) => `${p.fg} on ${p.bg}: ${p.got.toFixed(2)} < ${p.need}`);
    expect(failing).toEqual([]);
    expect(tokens.pairs.length).toBeGreaterThan(100);
  });
  it("generated files are in sync with tokens.json (run `pnpm tokens`)", () => {
    const { css, ts } = build(tokens);
    expect(readFileSync(path.join(root, "styles/tokens.css"), "utf8")).toBe(css);
    expect(readFileSync(path.join(root, "lib/tokens.generated.ts"), "utf8")).toBe(ts);
  });
  it("component styles use tokens only: no raw colours", () => {
    for (const f of ["styles/components.css", "styles/editor.css", "app/globals.css"]) {
      const css = readFileSync(path.join(root, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(css.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? [], f).toEqual([]);
    }
  });
});
