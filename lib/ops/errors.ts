/** Spec §8.3 error codes. Every failure says how to fix it and, where useful, returns the current state so the agent can re-aim. */
export type ErrorCode =
  | "guard_mismatch" | "missing_guard" | "find_none" | "char_gone" | "block_gone" | "cell_none"
  | "last_block" | "last_tab" | "anchors_affected" | "dropped" | "bad_request" | "forbidden" | "too_many";

export type OpFailure = { ok: false; code: ErrorCode; path?: string; fix: string; current?: unknown; opIndex?: number };

export class OpError extends Error {
  constructor(public failure: OpFailure) {
    super(`${failure.code}: ${failure.fix}`);
  }
}

export const fail = (code: ErrorCode, fix: string, extra: { path?: string; current?: unknown } = {}): never => {
  throw new OpError({ ok: false, code, fix, ...extra });
};
