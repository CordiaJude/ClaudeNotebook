import "server-only";
import { anthropicModel } from "./anthropic";
import { scriptedModel } from "./scripted";
import type { Model } from "./types";

export const DEFAULT_MODEL = "claude-opus-5-5";
let cached: Model | null = null;

/** Why the scripted stand-in is in use, for the UI to say plainly. Null when the real model is on. */
export function demoReason(): "no-key" | "public-demo" | null {
  const key = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) return "no-key";
  // While accounts are still the demo kind (anyone can sign in), the public site must not spend real model credits.
  // Previews are private, so the real model runs there. ALLOW_PUBLIC_DEMO_AI=1 overrides, knowingly.
  if (process.env.VERCEL_ENV === "production" && process.env.ALLOW_PUBLIC_DEMO_AI !== "1") return "public-demo";
  return null;
}

/** The one place that chooses the model. */
export function getModel(): Model {
  if (cached) return cached;
  const key = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY;
  cached = key && !demoReason() ? anthropicModel({ apiKey: key, model: process.env.AI_MODEL || DEFAULT_MODEL }) : scriptedModel();
  return cached;
}
