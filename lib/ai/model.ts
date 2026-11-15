import "server-only";
import { anthropicModel } from "./anthropic";
import { scriptedModel } from "./scripted";
import type { Model } from "./types";

export const DEFAULT_MODEL = "claude-opus-5-5";
let cached: Model | null = null;
/** The one place that chooses the model. With a key set, the hosted model; without one, the scripted stand-in. */
export function getModel(): Model {
  if (cached) return cached;
  const apiKey = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY;
  cached = apiKey ? anthropicModel({ apiKey, model: process.env.AI_MODEL || DEFAULT_MODEL }) : scriptedModel();
  return cached;
}
