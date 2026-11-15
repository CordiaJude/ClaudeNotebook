import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND } from "@/lib/brand";

describe("BRAND", () => {
  it("is the placeholder name, with the assistant called AI", () => {
    expect(BRAND.name).toBe("Draftly");
    expect(BRAND.assistant).toBe("AI");
  });
  it("design files carry no other company's name", () => {
    for (const f of ["styles/tokens.css", "styles/components.css", "styles/editor.css", "app/globals.css", "replica/design/tokens.json", "components/doc/parts.tsx", "components/design/Showcase.tsx", "lib/brand.ts"]) {
      expect(readFileSync(path.join(import.meta.dirname, "../..", f), "utf8"), f).not.toMatch(/claude|anthropic/i);
    }
  });
});
