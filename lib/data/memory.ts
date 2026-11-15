/* The data layer, in memory. Same contract as the real one will have: every call checks the acting user's role,
   so screens built on it behave the same when the database arrives. Seeded with a demo account and a few documents. */
import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { Fragment } from "prosemirror-model";
import { withIds } from "@/lib/doc/ids";
import { parseMarkdown } from "@/lib/doc/markdown";
import { docSchema } from "@/lib/doc/schema";
import { initialUpdate } from "@/lib/doc/ydoc";
import { localRooms } from "@/lib/rooms/local";
import { DataError, canEdit, type Artifact, type Data, type Kind, type Message, type Role, type Run, type Tab, type Template, type User } from "./types";

type Account = User & { hash: string };
type ArtifactRow = { id: string; kind: Kind; title: string; ownerId: string; createdAt: string; updatedAt: string; deletedAt?: string; text: string };
type Store = {
  users: Map<string, Account>; artifacts: Map<string, ArtifactRow>; tabs: Map<string, Tab>;
  permissions: Map<string, Role>; // `${artifactId}:${userId}`
  chats: Map<string, Message[]>; // `${artifactId}:${userId}`
  runs: Map<string, Run>; usage: Map<string, number>; seeded: boolean;
};

const g = globalThis as typeof globalThis & { __memoryData?: Store };
const db: Store = (g.__memoryData ??= { users: new Map(), artifacts: new Map(), tabs: new Map(), permissions: new Map(), chats: new Map(), runs: new Map(), usage: new Map(), seeded: false });

export const DAILY_RUNS = Number(process.env.AI_DAILY_RUNS ?? 60);
export const DEMO = { email: "demo@draftly.test", password: "draftly-demo", name: "Jude Demo" };
const now = () => new Date().toISOString();
const hash = (password: string) => scryptSync(password, "draftly-demo-salt", 32).toString("hex");
const normal = (email: string) => email.trim().toLowerCase();

export const TEMPLATES: Template[] = [
  { id: "blank-doc", kind: "doc", title: "Blank doc", blurb: "Start from an empty page.", markdown: "" },
  { id: "memo", kind: "doc", title: "Memo", blurb: "Decision first, then the reasons.", markdown: "State the decision in one sentence.\n\n## Why\n\nThe two or three reasons that matter.\n\n## What happens next\n\n- Who does what, by when" },
  { id: "plan", kind: "doc", title: "Plan", blurb: "Goal, steps, risks.", markdown: "What this plan achieves, and by when.\n\n## Steps\n\n1. First step\n2. Second step\n\n## Risks\n\n- What could slip, and the fallback" },
  { id: "meeting", kind: "doc", title: "Meeting notes", blurb: "Decisions and who owns them.", markdown: "Date and who was there.\n\n## Decisions\n\n- Decision, and why\n\n## Actions\n\n- [ ] Action, owner, date" },
  { id: "blank-deck", kind: "deck", title: "Blank deck", blurb: "Start from an empty slide.", markdown: "" },
];

function docFor(title: string, markdown: string) {
  const s = docSchema();
  const body = markdown.trim() ? parseMarkdown(markdown) : [s.nodes.paragraph!.create()];
  return withIds(s.nodes.doc!.create(null, Fragment.from([s.nodes.title!.create(null, title ? s.text(title) : null), ...body])));
}

function addArtifact(ownerId: string, kind: Kind, title: string, markdown: string, at = now()): { row: ArtifactRow; tab: Tab } {
  const id = randomUUID(), tabId = randomUUID();
  const row: ArtifactRow = { id, kind, title: title || "Untitled", ownerId, createdAt: at, updatedAt: at, text: markdown.replace(/[#*|>-]/g, " ").replace(/\s+/g, " ").trim() };
  const tab: Tab = { id: tabId, artifactId: id, title: "Main", position: "a0", room: `a:${id}:t:${tabId}` };
  db.artifacts.set(id, row); db.tabs.set(tabId, tab); db.permissions.set(`${id}:${ownerId}`, "owner");
  void localRooms.create(tab.room, initialUpdate(docFor(title, markdown)));
  return { row, tab };
}

function seed() {
  if (db.seeded) return;
  db.seeded = true;
  const mk = (email: string, name: string, password: string): Account => { const u = { id: randomUUID(), email, name, hash: hash(password) }; db.users.set(u.id, u); return u; };
  const me = mk(DEMO.email, DEMO.name, DEMO.password);
  const priya = mk("priya@draftly.test", "Priya Shah", "draftly-demo");
  const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
  addArtifact(me.id, "doc", "Q1 launch plan", "The launch moves to **4 March** because the supplier is two weeks late. The date is firm if the parts arrive by 20 February.\n\n## Timeline\n\n| Date | Milestone | Owner |\n|---|---|---|\n| 20 February | Parts arrive | Priya |\n| 27 February | Final test | Sam |\n| 4 March | Launch | Jude |\n\n## Risks\n\n- A second supplier delay pushes the launch to April.\n- The test window is one week, with no slack.", ago(2));
  addArtifact(me.id, "deck", "Board update", "", ago(26));
  const offsite = addArtifact(priya.id, "doc", "Team offsite notes", "We agreed to hold the offsite in May, in Lisbon, for two days.\n\n## Decisions\n\n- Two days, not three.\n- Budget is capped at 12,000.\n\n## Actions\n\n- [ ] Book the venue\n- [ ] Send the survey", ago(50));
  db.permissions.set(`${offsite.row.id}:${me.id}`, "viewer");
  const hiring = addArtifact(priya.id, "doc", "Hiring plan", "We hire two engineers and one designer this half.\n\n## Roles\n\n1. Senior engineer, platform\n2. Engineer, editor\n3. Product designer", ago(75));
  db.permissions.set(`${hiring.row.id}:${me.id}`, "editor");
}

const roleOf = (userId: string, artifactId: string): Role | null => {
  const a = db.artifacts.get(artifactId);
  return a && !a.deletedAt ? (db.permissions.get(`${artifactId}:${userId}`) ?? null) : null;
};
const view = (a: ArtifactRow, role: Role): Artifact => ({ id: a.id, kind: a.kind, title: a.title, ownerId: a.ownerId, ownerName: db.users.get(a.ownerId)?.name ?? "Someone", role, preview: a.text.slice(0, 160), createdAt: a.createdAt, updatedAt: a.updatedAt });
function need(userId: string, artifactId: string, test: (r: Role) => boolean, what: string): ArtifactRow {
  const role = roleOf(userId, artifactId);
  if (!role) throw new DataError("not_found", "That doc was not found, or it is not shared with you.");
  if (!test(role)) throw new DataError("forbidden", what);
  return db.artifacts.get(artifactId)!;
}

export const memoryData: Data = {
  async signUp({ email, password, name }) {
    seed();
    const e = normal(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new DataError("invalid", "Enter a full email address.");
    if (password.length < 8) throw new DataError("invalid", "Use a password of at least 8 characters.");
    if (!name.trim()) throw new DataError("invalid", "Enter your name.");
    if ([...db.users.values()].some((u) => u.email === e)) throw new DataError("conflict", "An account with that email already exists. Sign in instead.");
    const u: Account = { id: randomUUID(), email: e, name: name.trim().slice(0, 80), hash: hash(password) };
    db.users.set(u.id, u);
    return { id: u.id, email: u.email, name: u.name };
  },
  async signIn({ email, password }) {
    seed();
    const u = [...db.users.values()].find((x) => x.email === normal(email));
    const given = Buffer.from(hash(password), "hex");
    if (!u || !timingSafeEqual(given, Buffer.from(u.hash, "hex"))) throw new DataError("unauthenticated", "That email and password do not match.");
    return { id: u.id, email: u.email, name: u.name };
  },
  async user(id) { seed(); const u = db.users.get(id); return u ? { id: u.id, email: u.email, name: u.name } : null; },

  async listArtifacts(userId, filter = {}) {
    seed();
    const q = filter.q?.trim().toLowerCase();
    const out: Artifact[] = [];
    for (const a of db.artifacts.values()) {
      const role = roleOf(userId, a.id);
      if (!role || (filter.kind && a.kind !== filter.kind)) continue;
      if (q && !a.title.toLowerCase().includes(q) && !a.text.toLowerCase().includes(q)) continue;
      out.push(view(a, role));
    }
    return out.sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
  },
  async getArtifact(userId, id) {
    seed();
    const role = roleOf(userId, id);
    if (!role) return null;
    const tabs = [...db.tabs.values()].filter((t) => t.artifactId === id).sort((a, b) => a.position.localeCompare(b.position));
    return { artifact: view(db.artifacts.get(id)!, role), tabs };
  },
  async createArtifact(userId, { kind, title, templateId }) {
    seed();
    if (!db.users.has(userId)) throw new DataError("unauthenticated", "Sign in first.");
    const tpl = templateId ? TEMPLATES.find((t) => t.id === templateId && t.kind === kind) : undefined;
    const name = (title ?? (tpl && tpl.markdown ? tpl.title : "")).trim().slice(0, 200);
    const { row, tab } = addArtifact(userId, kind, name, tpl?.markdown ?? "");
    return { artifact: view(row, "owner"), tab, seed: tpl?.markdown ?? "" };
  },
  async renameArtifact(userId, id, title) {
    const a = need(userId, id, (r) => r === "owner", "Only the owner can rename this.");
    const t = title.trim().slice(0, 200);
    if (!t) throw new DataError("invalid", "A name cannot be empty.");
    a.title = t; a.updatedAt = now();
  },
  async deleteArtifact(userId, id) {
    const a = need(userId, id, (r) => r === "owner", "Only the owner can delete this.");
    a.deletedAt = now();
  },
  async roleOn(userId, artifactId) { seed(); return roleOf(userId, artifactId); },
  async templates(kind) { return TEMPLATES.filter((t) => !kind || t.kind === kind); },

  async tabByRoom(room) { seed(); return [...db.tabs.values()].find((t) => t.room === room) ?? null; },
  async saveMirror(tabId, { text, title }) {
    const tab = db.tabs.get(tabId);
    const a = tab && db.artifacts.get(tab.artifactId);
    if (!a) return;
    a.text = text.slice(0, 200_000);
    a.updatedAt = now();
    if (title && (a.title === "Untitled" || !a.title)) a.title = title.slice(0, 200);
  },

  async messages(userId, artifactId) { need(userId, artifactId, () => true, ""); return [...(db.chats.get(`${artifactId}:${userId}`) ?? [])]; },
  async addMessage(userId, artifactId, message) {
    need(userId, artifactId, () => true, "");
    const key = `${artifactId}:${userId}`;
    const m: Message = { ...message, id: randomUUID(), createdAt: now() };
    db.chats.set(key, [...(db.chats.get(key) ?? []), m]);
    return m;
  },
  async updateMessage(userId, artifactId, messageId, patch) {
    const list = db.chats.get(`${artifactId}:${userId}`) ?? [];
    const m = list.find((x) => x.id === messageId);
    if (m) Object.assign(m, patch);
  },

  async tryStartRun(userId) {
    const key = `${userId}:${now().slice(0, 10)}`;
    const used = db.usage.get(key) ?? 0;
    if (used >= DAILY_RUNS) return false;
    db.usage.set(key, used + 1);
    return true;
  },
  async openRun(run) {
    need(run.userId, run.artifactId, canEdit, "You can view this, not change it. Ask the owner for edit access to use AI here.");
    const r: Run = { ...run, id: randomUUID(), status: "running", undo: [], startedAt: now() };
    db.runs.set(r.id, r);
    return r;
  },
  async updateRun(runId, patch) { const r = db.runs.get(runId); if (r) Object.assign(r, patch); },
  async getRun(userId, runId) { const r = db.runs.get(runId); return r && r.userId === userId ? { ...r } : null; },
};

/** Test helper: forget everything and seed again. */
export function resetMemory() {
  db.users.clear(); db.artifacts.clear(); db.tabs.clear(); db.permissions.clear(); db.chats.clear(); db.runs.clear(); db.usage.clear(); db.seeded = false;
  seed();
}
/** Test and demo helper: give someone a role on an artifact. Sharing itself is built in the Docs MVP milestone. */
export function grantForTest(artifactId: string, userId: string, role: Role) { db.permissions.set(`${artifactId}:${userId}`, role); }
