/** Spec §2: the model id lives here so it is easy to swap. */
export const MODEL = "claude-sonnet-5-5";
/** Sonnet 5.5: effort `medium` suits multi-step tool use; thinking stays on its adaptive default. */
export const EFFORT = "medium" as const;
export const MAX_TURNS = 40;
export const MAX_TOKENS = 16_000;
/** Vercel function limit minus headroom: stop gracefully before the platform kills the request. */
export const RUN_BUDGET_MS = 270_000;
export const DAILY_RUNS = Number(process.env.AGENT_DAILY_RUNS ?? 40);
export const HISTORY_TURNS = 10;
