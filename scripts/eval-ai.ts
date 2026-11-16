/* Runs the real flows against the real model, on in-memory documents, and prints what happened.
   Usage:  AI_API_KEY=... pnpm eval:ai [draft|selection|edit|deck]      (optional: AI_MODEL=claude-sonnet-5-5)
   It spends real tokens: roughly twenty model turns for all four scenarios. */
import { anthropicModel } from "@/lib/ai/anthropic";
import { SCENARIOS, runScenario, type Scenario } from "@/lib/ai/evals";

const apiKey = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error("Set AI_API_KEY first."); process.exit(2); }
const model = anthropicModel({ apiKey, model: process.env.AI_MODEL || "claude-opus-5-5" });
const only = process.argv[2] as Scenario | undefined;

(async () => {
  let failed = 0;
  for (const s of SCENARIOS.filter((x) => !only || x === only)) {
    const r = await runScenario(model, s);
    console.log(`\n== ${s}  (${r.model}, ${r.seconds}s, ${r.inputTokens} in / ${r.outputTokens} out)`);
    for (const c of r.checks) { if (!c.ok) failed++; console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.note ? `\n      ${c.note}` : ""}`); }
    if (r.error) { failed++; console.log(`ERROR ${r.error}`); }
    if (r.document) console.log(`\n----- document -----\n${r.document}\n--------------------`);
  }
  process.exit(failed ? 1 : 0);
})();
