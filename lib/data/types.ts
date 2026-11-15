/* The data layer's contract. Screens and routes only ever call these functions. Today they are served from memory
   (lib/data/memory.ts); /replica-backend adds a Supabase implementation with the same signatures.
   Every function that touches a doc or deck takes the acting user's id and checks their role itself. */
import type { DesignSystem } from "@/lib/deck/design";
import type { DeckUndo } from "@/lib/deck/edit";
import type { UndoEntry } from "@/lib/doc/edit";
import type { Scope } from "@/lib/doc/scope";

export type Role = "owner" | "editor" | "commenter" | "viewer";
export type Kind = "doc" | "deck";
export const canEdit = (r: Role | null | undefined): boolean => r === "owner" || r === "editor";
export const canComment = (r: Role | null | undefined): boolean => r === "owner" || r === "editor" || r === "commenter";

export type User = { id: string; email: string; name: string };
export type Artifact = { id: string; kind: Kind; title: string; ownerId: string; ownerName: string; role: Role; preview: string; createdAt: string; updatedAt: string };
export type Tab = { id: string; artifactId: string; title: string; position: string; room: string };
/** Someone with access, or someone invited by email who has no account yet (`pending`). */
export type Person = { id: string | null; name: string; email: string; role: Role; pending?: boolean };
export type ShareRole = "viewer" | "editor";
export type Template = { id: string; kind: Kind; title: string; blurb: string; markdown: string };

export type Question = { id: string; prompt: string; options?: string[] };
export type MessageContent =
  | { kind: "text"; text: string; undone?: boolean; stopped?: boolean }
  | { kind: "questions"; questions: Question[]; answered?: Record<string, string> | "skipped" }
  | { kind: "answers"; values: Record<string, string> | "skipped" }
  | { kind: "error"; text: string };
export type Message = { id: string; role: "user" | "assistant"; content: MessageContent; runId?: string; undoable?: boolean; createdAt: string };

export type RunStatus = "running" | "awaiting_answers" | "done" | "error" | "stopped";
export type Run = { id: string; artifactId: string; tabId: string; userId: string; mode: "chat" | "selection"; status: RunStatus; scope?: Scope; undo: UndoEntry[] | DeckUndo[]; undoneAt?: string; section?: string; model?: string; inputTokens?: number; outputTokens?: number; startedAt: string; finishedAt?: string };

export type ErrorCode = "unauthenticated" | "forbidden" | "not_found" | "invalid" | "conflict" | "limit";
export class DataError extends Error {
  constructor(public code: ErrorCode, message: string) { super(message); }
}

export interface Data {
  // accounts
  signUp(input: { email: string; password: string; name: string }): Promise<User>;
  signIn(input: { email: string; password: string }): Promise<User>;
  user(id: string): Promise<User | null>;

  // library
  listArtifacts(userId: string, filter?: { q?: string; kind?: Kind }): Promise<Artifact[]>;
  getArtifact(userId: string, id: string): Promise<{ artifact: Artifact; tabs: Tab[] } | null>;
  createArtifact(userId: string, input: { kind: Kind; title?: string; templateId?: string }): Promise<{ artifact: Artifact; tab: Tab; seed: string }>;
  renameArtifact(userId: string, id: string, title: string): Promise<void>;
  deleteArtifact(userId: string, id: string): Promise<void>;
  roleOn(userId: string, artifactId: string): Promise<Role | null>;
  templates(kind?: Kind): Promise<Template[]>;

  // sharing: private by default; only the owner changes who has access
  /** Everyone with access, owner first. Any role may look. */
  people(userId: string, artifactId: string): Promise<Person[]>;
  /** Give a role to the account with this address, or record an invite when there is none yet. */
  shareByEmail(userId: string, artifactId: string, email: string, role: ShareRole): Promise<"shared" | "invited">;
  setRole(userId: string, artifactId: string, email: string, role: ShareRole): Promise<void>;
  /** The owner removes someone; anyone but the owner may remove themselves. */
  removeAccess(userId: string, artifactId: string, email: string): Promise<void>;

  // design system: the colours and fonts every deck of a person follows
  /** With an artifact id: the design system that deck is shown in (its owner's), for anyone who can open it. Without: the person's own. */
  getDesign(userId: string, artifactId?: string): Promise<DesignSystem>;
  /** The value is checked first (colours, fonts, contrast); a DataError "invalid" carries what is wrong. */
  saveDesign(userId: string, design: unknown): Promise<DesignSystem>;
  resetDesign(userId: string): Promise<DesignSystem>;

  // live documents
  tabByRoom(room: string): Promise<Tab | null>;
  /** Server only: keeps the searchable copy of a tab's text, and names an untitled artifact after its first title. */
  saveMirror(tabId: string, mirror: { text: string; title: string }): Promise<void>;

  // the chat beside the editor (private to each person)
  messages(userId: string, artifactId: string): Promise<Message[]>;
  addMessage(userId: string, artifactId: string, message: Omit<Message, "id" | "createdAt">): Promise<Message>;
  updateMessage(userId: string, artifactId: string, messageId: string, patch: Partial<Pick<Message, "content" | "undoable">>): Promise<void>;

  // AI runs
  /** Counts one run against the person's daily allowance. False when the allowance is used up. */
  tryStartRun(userId: string): Promise<boolean>;
  openRun(run: Pick<Run, "artifactId" | "tabId" | "userId" | "mode" | "scope">): Promise<Run>;
  updateRun(runId: string, patch: Partial<Pick<Run, "status" | "undo" | "undoneAt" | "section" | "finishedAt" | "model" | "inputTokens" | "outputTokens">>): Promise<void>;
  getRun(userId: string, runId: string): Promise<Run | null>;
}
