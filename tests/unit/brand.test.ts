import { describe, expect, it } from "vitest";
import { BRAND } from "@/lib/brand";

describe("BRAND", () => {
  it("has the required legal line", () => {
    expect(BRAND.legalLine).toBe("Independent project. Not affiliated with or endorsed by Anthropic.");
  });
});
