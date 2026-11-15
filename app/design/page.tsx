import type { Metadata } from "next";
import { Showcase } from "@/components/design/Showcase";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Wordmark } from "@/components/brand/Mark";
import { BRAND } from "@/lib/brand";
import { TOKENS } from "@/lib/tokens.generated";

export const metadata: Metadata = { title: `Design system · ${BRAND.name}` };

type Tok = { name: string; value: string };
const toks = (theme: "light" | "dark"): Tok[] => Object.entries(TOKENS.color[theme]).map(([name, value]) => ({ name, value }));
const other: string[] = [
  ...Object.entries(TOKENS.font).map(([k, v]) => `font-${k}: ${v}`),
  ...Object.entries(TOKENS.type).map(([k, v]) => `text-${k}: ${v.size}/${v.line}, weight ${v.weight}${"family" in v ? `, ${v.family}` : ""}`),
  `space: ${TOKENS.space.join(", ")}`,
  ...Object.entries(TOKENS.radius).map(([k, v]) => `radius-${k}: ${v}px`),
  ...Object.entries(TOKENS.motion).map(([k, v]) => `motion-${k}: ${v}`),
  ...Object.entries(TOKENS.layout).filter(([, v]) => typeof v === "number").map(([k, v]) => `layout-${k}: ${v}px`),
];

function Tokens({ tokens }: { tokens: Tok[] }) {
  return (
    <>
      <div className="ui-swatch-grid">
        {tokens.map((t) => (
          <div key={t.name} className="ui-token"><i style={{ background: `var(--color-${t.name})` }} /><span>{t.name}<br />{t.value}</span></div>
        ))}
      </div>
      <details style={{ marginTop: 16 }}>
        <summary className="ui-caption" style={{ cursor: "pointer" }}>Type, spacing, radii, motion, layout ({other.length})</summary>
        <ul className="ui-code" style={{ fontSize: 12, listStyle: "none", padding: 0 }}>
          {other.map((t) => <li key={t}>{t}</li>)}
        </ul>
      </details>
    </>
  );
}

function ThemePane({ theme, tokens }: { theme: "light" | "dark"; tokens: Tok[] }) {
  return (
    <div data-theme={theme} style={{ background: "var(--color-bg)", color: "var(--color-text)", padding: "48px 0", borderTop: "1px solid var(--color-border)" }} data-testid={`pane-${theme}`}>
      <div className="ui-section">
        <h2 className="ui-h1" style={{ margin: "0 0 24px" }}>{theme === "light" ? "Light" : "Dark"} theme</h2>
        <h3 className="ui-eyebrow" style={{ marginBottom: 8 }}>Color tokens</h3>
        <Tokens tokens={tokens} />
        <Showcase />
      </div>
    </div>
  );
}

export default function DesignPage() {
  return (
    <main>
      <header className="ui-section" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 72 }}>
        <Wordmark /><ThemeToggle />
      </header>
      <div className="ui-section" style={{ padding: "32px 24px" }}>
        <p className="ui-eyebrow">Living style guide</p>
        <h1 className="ui-h-title" style={{ margin: "8px 0 8px" }}>Design system</h1>
        <p className="ui-caption" style={{ maxWidth: 560 }}>Every token and component, in both themes. Tokens come from <code className="ui-code">replica/design/tokens.json</code>; each component lists the recon screens it is used on.</p>
      </div>
      <ThemePane theme="light" tokens={toks("light")} />
      <ThemePane theme="dark" tokens={toks("dark")} />
      <footer className="ui-section ui-caption" style={{ padding: "24px 24px 48px" }}>{BRAND.name} design system</footer>
    </main>
  );
}
