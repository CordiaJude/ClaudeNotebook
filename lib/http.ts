import { NextResponse } from "next/server";
import { DataError, type ErrorCode } from "@/lib/data/types";

const STATUS: Record<ErrorCode, number> = { unauthenticated: 401, forbidden: 403, not_found: 404, invalid: 400, conflict: 409, limit: 429 };
export const problem = (code: ErrorCode, message: string) => NextResponse.json({ code, message }, { status: STATUS[code] });
/** Turns a thrown DataError into its HTTP answer; anything else is a plain 500 with no internals leaked. */
export function answerError(e: unknown) {
  if (e instanceof DataError) return problem(e.code, e.message);
  console.error(e);
  return NextResponse.json({ code: "error", message: "Something went wrong on our side. Try again." }, { status: 500 });
}
