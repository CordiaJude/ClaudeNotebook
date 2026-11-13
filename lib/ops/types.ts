import type { ErrorCode } from "./errors";

export type CellRef = { table: string; row: number; col: number };
export type Target =
  | { kind: "find"; text: string; nth?: number; within?: CellRef }
  | { kind: "blocks"; ids: string[] }
  | ({ kind: "cell" } & CellRef)
  | { kind: "root" };

export type Side = "before" | "after" | "start" | "end";
export type ChipMap = Record<string, Record<string, unknown>>;
export type Content =
  | { as: "text" | "markdown"; from: { kind: "inline"; content: string }; blocks?: ChipMap }
  | { as: "row"; cells: string[] }
  | { as: "cells"; values: string[] };

type Common = { allowDetach?: boolean };
export type Op =
  | ({ op: "replace"; target: Target; content: Content; ifHash?: string | Record<string, string> } & Common)
  | ({ op: "insert"; target: Target; side: Side; content: Content; each?: boolean } & Common)
  | ({ op: "delete"; target: Target; ifHash?: string | Record<string, string>; each?: boolean } & Common)
  | { op: "move"; target: { kind: "blocks"; ids: string[] }; to: { kind: "blocks"; ids: string[] }; side: "before" | "after" }
  | { op: "set"; target: Target; attrs: Record<string, unknown> }
  | { op: "wrap"; target: { kind: "blocks"; ids: string[] }; with: "blockquote" | "bulletList" | "orderedList" | "taskList" }
  | { op: "unwrap"; target: { kind: "blocks"; ids: string[] } }
  | { op: "join"; target: { kind: "blocks"; ids: string[] } }
  | { op: "restore"; revision: string };

export type Touched = { id: string; h: string };
export type ApplyOk = { ok: true; doc: import("prosemirror-model").Node; touched: Touched[]; removed: string[]; detached: string[] };
export type ApplyFail = { ok: false; code: ErrorCode; path?: string; fix: string; current?: unknown; opIndex?: number };
export type ApplyResult = ApplyOk | ApplyFail;
export const MAX_OPS = 50;
