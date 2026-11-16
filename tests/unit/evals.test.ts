import { describe, expect, it } from "vitest";
import { runScenario } from "@/lib/ai/evals";
import { demoReason } from "@/lib/ai/model";
import { scriptedModel } from "@/lib/ai/scripted";

describe("the live checks themselves", () => {
  const model = scriptedModel({ wordMs: 0, toolMs: 0 });
  it.each(["draft", "selection", "edit", "deck"] as const)("scenario %s passes against the scripted model", async (s) => {
    const r = await runScenario(model, s);
    expect(r.error).toBeUndefined();
    expect(r.checks.filter((c) => !c.ok)).toEqual([]);
    expect(r.checks.length).toBeGreaterThanOrEqual(3);
  });
});

describe("the real model is never used on the public site while sign-in is the demo kind", () => {
  const withEnv = (env: Record<string, string | undefined>, fn: () => void) => { const old = { ...process.env }; Object.assign(process.env, env); for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; try { fn(); } finally { process.env = old; } };
  it("no key: demo", () => withEnv({ AI_API_KEY: undefined, ANTHROPIC_API_KEY: undefined }, () => expect(demoReason()).toBe("no-key")));
  it("key on a private preview or locally: real model", () => {
    withEnv({ ANTHROPIC_API_KEY: "k", VERCEL_ENV: "preview" }, () => expect(demoReason()).toBeNull());
    withEnv({ AI_API_KEY: "k", VERCEL_ENV: undefined }, () => expect(demoReason()).toBeNull());
  });
  it("key on the public site: still the demo, unless switched on knowingly", () => {
    withEnv({ ANTHROPIC_API_KEY: "k", VERCEL_ENV: "production", ALLOW_PUBLIC_DEMO_AI: undefined }, () => expect(demoReason()).toBe("public-demo"));
    withEnv({ ANTHROPIC_API_KEY: "k", VERCEL_ENV: "production", ALLOW_PUBLIC_DEMO_AI: "1" }, () => expect(demoReason()).toBeNull());
  });
});
