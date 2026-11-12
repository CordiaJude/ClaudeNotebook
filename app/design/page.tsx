import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { Showcase } from "@/components/design/Showcase";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Wordmark } from "@/components/brand/Mark";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Design system · ${BRAND.name}` };

type Tok = { name: string; value: string };
function readTokens(): { light: Tok[]; dark: Tok[] } {
  const css = readFileSync(path.join(process.cwd(), "styles/tokens.css"), "utf8");
  const [lightBlock = "", darkBlock = ""] = css.split('[data-theme="dark"]');
  const pick = (b: string): Tok[] => [...b.matchAll(/(--cn-[\w-]+):\s*([^;]+);/g)].map((m) => ({ name: m[1]!, value: m[2]!.trim() }));
  return { light: pick(lightBlock), dark: pick(darkBlock) };
}
const isColor = (v: string) => /^(#|rgba?\()/.test(v);

function Tokens({ tokens }: { tokens: Tok[] }) {
  const colors = tokens.filter((t) => isColor(t.value));
  const other = tokens.filter((t) => !isColor(t.value));
  return (
    <>
      <div className="cn-swatch-grid">
        {colors.map((t) => (
          <div key={t.name} className="cn-token"><i style={{ background: `var(${t.name})` }} /><span>{t.name}<br />{t.value}</span></div>
        ))}
      </div>
      <details style={{ marginTop: 16 }}>
        <summary className="cn-caption" style={{ cursor: "pointer" }}>Type, layout, radii, shadows, motion ({other.length})</summary>
        <ul className="cn-code" style={{ fontSize: 12, listStyle: "none", padding: 0 }}>
          {other.map((t) => <li key={t.name}>{t.name}: {t.value}</li>)}
        </ul>
      </details>
    </>
  );
}

function ThemePane({ theme, tokens }: { theme: "light" | "dark"; tokens: Tok[] }) {
  return (
    <div data-theme={theme} style={{ background: "var(--cn-canvas)", color: "var(--cn-text-primary)", padding: "48px 0", borderTop: "1px solid var(--cn-border)" }} data-testid={`pane-${theme}`}>
      <div className="cn-section">
        <h2 className="cn-h1" style={{ margin: "0 0 24px" }}>{theme === "light" ? "Light" : "Dark"} theme</h2>
        <h3 className="cn-eyebrow" style={{ marginBottom: 8 }}>Color tokens</h3>
        <Tokens tokens={tokens} />
        <Showcase />
      </div>
    </div>
  );
}

export default function DesignPage() {
  const { light, dark } = readTokens();
  // Dark overrides apply on top of light values.
  const darkFull = light.map((t) => dark.findLast((d) => d.name === t.name) ?? t).concat(dark.filter((d) => !light.some((l) => l.name === d.name)));
  return (
    <main>
      <header className="cn-section" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 72 }}>
        <Wordmark /><ThemeToggle />
      </header>
      <div className="cn-section" style={{ padding: "32px 16px" }}>
        <p className="cn-eyebrow">Living style guide</p>
        <h1 className="cn-h-title" style={{ margin: "8px 0 8px" }}>Design system</h1>
        <p className="cn-caption" style={{ maxWidth: 560 }}>Every token and component, rendered in both themes. Tokens are read from <code className="cn-code">styles/tokens.css</code>. Values tagged [D] in the spec are tuned by eye.</p>
      </div>
      <ThemePane theme="light" tokens={light} />
      <ThemePane theme="dark" tokens={darkFull} />
      <footer className="cn-section cn-caption" style={{ padding: "24px 16px 48px" }}>{BRAND.legalLine}</footer>
    </main>
  );
}
