import "server-only";
import { scriptedModel } from "./scripted";
import type { Model } from "./types";

let cached: Model | null = null;
/** The one place that chooses the model. The scripted stand-in today; /replica-backend adds the hosted model. */
export const getModel = (): Model => (cached ??= scriptedModel());
