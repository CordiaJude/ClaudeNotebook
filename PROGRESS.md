# PROGRESS

## Phase 4 — Op engine + agent: CODE DONE, REAL-MODEL AND LIVE PATHS UNTESTED

**Built**
- `lib/ops/*` the op engine on ProseMirror transforms. Ops: replace (find / blocks / cell), insert (blocks / root / cell / find / table row / table column), delete (text, blocks, rows, columns), move, set (heading level, list kind, task checked, cell background/colwidth), wrap, unwrap, join. `restore` is refused until history exists (Phase 8). Atomic per call; max 50 ops (`too_many`). Malformed ops get a fix, not a stack trace.
- All spec error codes: guard_mismatch, missing_guard, find_none, char_gone (nth gone), block_gone, cell_none, last_block, anchors_affected, dropped, bad_request, forbidden, too_many. `last_tab` lives in `lib/tabs.ts` (Phase 3). Each failure carries `fix` and, where useful, `current` (the block as it stands now) so the agent can re-aim.
- Guards: whole-block / cell edits need `ifHash` (pending blocks exempt); text under a comment mark cannot be rewritten or deleted without `allowDetach` (then reported in `detached`); markdown replaces that would lose chips are refused as `dropped`; title and byline are structural and never replaced/deleted as blocks.
- Markdown dialect: GFM + `<?cn block KEY?>` tokens resolved from a `blocks` map (date, mention, pending, embed, dropdown). `lib/ops/birth.ts` turns skeleton markdown into title + byline + body.
- `lib/ops/ydoc.ts`: reads the live Yjs doc into ProseMirror, applies ops, writes back only a **delta** (so concurrent human edits elsewhere merge by CRDT). Round-trips the full schema losslessly.
- `lib/ai/*`: tools `notebook_create`, `notebook_read` (outline / view / search / changes), `notebook_edit`; manual tool-use loop on `claude-sonnet-5-5` (prompt-cached, effort `medium`, no forced tool_choice, no sampling params, thinking left on its default and passed back unchanged); system prompt in our words (byte-stable); `executeRun`: role check, daily cap, run ledger, pre-run Liveblocks version snapshot, SSE stream, presence, Stop via abort, 270 s time budget, 40-turn cap.
- `POST /api/agent/run` (SSE). Migration `0003_agent_usage.sql`: atomic per-user daily cap `agent_try_start_run` (service role only). `AGENT_DAILY_RUNS` (default 40).
- UI: Ask Claude panel in the right rail (examples as the empty state = F113, streaming notes + reply, Stop, `aria-live`, Cmd/Ctrl+Shift+K), "Write with Claude" prompt on the notebooks list (the notebook opens the moment Claude has laid out its sections; the run keeps streaming after navigation), selection hand-off from the bubble toolbar ("Ask Claude", F111), presence pill "Claude is editing · <section>" (F101).
- `scripts/agent-eval.ts` (`pnpm eval:agent`): 6 scripted evals against the REAL model (memo, comparison table, edit-in-place, human edits first, comment anchors, deleted pending block). Not run here (no key).

**Verified (automated)**: 119 unit/RLS tests incl. 55 engine tests and an 8000-run property test (random op sequences never corrupt the doc, never duplicate ids, never lose a comment anchor silently), Yjs convergence tests (agent fills a pending block while a person edits elsewhere: both survive; stale guard refused and nothing overwritten), scripted-model tests for the full birth-then-fill loop, guard errors reaching the model, abort, budgets, refusal, roles, cap; 36 Playwright tests incl. the panel UI against a stubbed SSE stream. The engine also runs correctly inside the real Next.js server bundle (checked with a throwaway route, since removed). Op-engine coverage: 97% lines, 91% statements, 78% branches.

**Bugs the property test found and fixed**: inserting a block beside a list item split the list and duplicated its id (placement is now exact or refused); wrapping a heading into a list dropped its comment mark and chips.

**NOT verified (needs the real key / live services)**
- Anything that depends on the model's judgement: skeleton-first, one section per call, recovering from `guard_mismatch`. The tests prove the plumbing with a scripted model. Run `pnpm eval:agent` with your key.
- Liveblocks server calls: `getOrCreateRoom`, `getYjsDocumentAsBinaryUpdate`, `sendYjsBinaryUpdate` (do open browsers receive the delta live?), `createVersionHistorySnapshot`, `setPresence` (does `useOthers` show the REST presence user `agent:claude`?).
- Supabase adapters (notebook/tab creation as the user, run ledger, the `agent_try_start_run` RPC), and the real SSE stream through Vercel.

**Decisions / deviations**
- Refusal fallbacks (`fallbacks: "default"` beta) are NOT enabled: the response shape adds block types I could not verify offline. A refusal ends the run with an error message.
- `restore`, `suggest` mode, comment/`@Claude` triggers, tabs/widget/history/enum/upload tools are later phases. Table merge/split by the agent is deferred (humans can merge/split in the UI).
- Claude has no live caret yet (presence pill only).
- Right rail is hidden below 1024 px (no bottom sheet yet), so the panel is desktop-only for now.
- `maxDuration = 300`: Vercel's cap depends on plan; verify yours. The loop stops itself at 270 s and says so.
- Nesting/targets: `find` is ambiguous-by-default (error unless `nth`), so the agent cannot edit the wrong occurrence by accident.

## Phase 3 — Tabs, chips, byline, pending: CODE DONE, LIVE PATHS UNTESTED

**Built**
- Doc schema is now `title byline block+` (spec §7): one title, byline right after it, never deletable; select-all+delete re-fills the structure. Enter in the title jumps to the body. Notebook title = first tab's title node.
- Byline = as-of date chip · author mention chip, nothing else (F05).
- Chips (inline atoms): mention (person / tab / notebook), date, dropdown (`enumId + index`); `embed` block (caption; widget rendering is Phase 7); `pending(intent)` block (dashed skeleton + intent, human-deletable). All inserted via `/` pickers. Chips work inside table cells (F23 dropdown part).
- Enums (F31): created from the dropdown picker, edited in a "Lists" dialog. Removing an option hides it (tombstone) so existing chips keep index + show "(removed)".
- Tabs (F01-F03): `lib/tabs.ts` pure rules (fractional-indexing string keys), server actions (`tab-actions.ts`) re-validate role + rules. Add, rename, reorder (drag + Move up/down menu), nest / un-nest (max one level), delete (refused for last tab; sub-tabs promoted in place). `?tab=<id>` selects the open tab; each tab = its own Liveblocks room.
- Tab links (F04) = tab/notebook mention chips; clicking opens the tab/notebook.
- `lib/editor/markdown.ts` `insertMarkdown()`: markdown must be parsed to body blocks, never inserted as a `doc` (schema requires title+byline). Phase 4 agent reuses it. This also fixed markdown paste.

**Verified (automated)**: 10 unit tests for tab rules incl. a 300-run property test (keys unique per level, no orphans, never empty, depth <= 1); 29 Playwright tests (all Phase 2 + new: byline, structure invariants, mention/tab/notebook/date chips, dropdown chip in a cell with enumId+index stored, removed-option display, pending skeleton + human delete, embed caption, block ids).

**NOT verified (needs live Supabase/Liveblocks)**: tab add/rename/move/nest/delete against the real DB (server actions are thin wrappers over the tested rules), enum create/edit persistence, members list for @-mentions, tab switching with live rooms.

**Decisions / deviations**
- BREAKING: existing Phase 2 test notebooks have an H1-first doc and will not match the new schema. Delete them and create new ones.
- Nesting depth capped at 1 (top level + sub-tabs) to keep delete/promote rules unambiguous.
- Deleting a tab does NOT delete its Liveblocks room (keeps history recoverable). Orphan rooms are cheap.
- Enums refresh on page load only (no realtime); a collaborator's new list appears after reload.
- F23 "comment on a cell" is Phase 5. Dropdown-in-cell is done.
- Pending blocks are not user-insertable from the slash menu (agent-only by design); tested via editor commands.

## Phase 2 — Editor core: CODE DONE, LIVE PATHS UNTESTED

**Built**
- Auth: Supabase magic link (`/login`, `/auth/callback`, `/auth/signout`), `proxy.ts` session refresh + redirect to `/login`. Migration `0002_profile_trigger.sql` auto-creates a `profiles` row per new user (needed: notebooks.owner_id FK). **Owner must run 0002 in the Supabase SQL editor.**
- Notebooks list (`/notebooks`): search, 6 templates (Blank, Memo, Plan, Brief, Report, Meeting notes), create via server action (notebook + first tab + room id `nb:<nb>:tab:<tab>`).
- Editor shell `/n/[id]`: tab tray (read-only list), paper, rail placeholder, responsive breakpoints per §4.4.
- Tiptap 3: H1-3, paragraphs, bullet/ordered/task lists (ticked = struck + dimmed), blockquote, divider, links (http/https/mailto/#/relative only), anchor links, marks (bold, italic, underline, strike, code, highlight), tables (resizable, header row, add/remove row/col, merge/split, 7-color cell backgrounds), code blocks with latex (KaTeX), csv (read-only grid), markdown (react-markdown, no raw HTML), mermaid (strict mode), highlight.js-style syntax colors, images (blob-only, upload route), slash menu, bubble toolbar, table bar, UniqueID on every block, markdown paste, HTML paste sanitized by schema.
- Liveblocks: `/api/liveblocks-auth` maps Supabase role -> room permission; `RoomProvider` per tab; Yjs sync + cursors via `@liveblocks/react-tiptap`; presence avatars. Autosave = Liveblocks persistence.
- Notebook title follows the first H1 (debounced 2s).
- `/api/upload` (png/jpeg/webp/gif, 10 MB, membership check before service-role write), `/api/blob/[id]` (RLS read, 5-min signed URL redirect).
- `/design/editor`: no-backend editor sandbox used by tests.

**Verified (automated, this sandbox)**: lint, typecheck, build; 10 unit/RLS tests (incl. profile trigger); 17 Playwright tests (11 editor: slash, shortcuts, tasks, marks, table + color + merge, 4 code languages, link safety, paste sanitize, markdown paste, block ids, undo/redo).

**NOT verified (sandbox cannot reach Supabase/Liveblocks)**: magic-link sign-in, creating a notebook, Liveblocks sync/cursors between two browsers, image upload, role->permission mapping, reload persistence. Owner is testing these on the deploy. Spec "done when" for two live browsers + reload is therefore OPEN.

**Decisions / deviations**
- Spec conflict: Cmd+K is both "link" (§4.9 list) and "Ask Claude focus" [D]. Cmd+K = link now; Ask Claude gets Cmd+Shift+K in Phase 4.
- Template content is seeded client-side via `initialContent` (applies only if the Yjs doc is empty) from `?t=` after creation. A notebook opened first without `?t=` starts blank.
- Tab add/rename/nest/delete UI is Phase 3 (tray is read-only). Chips, byline, pending, embed are Phase 3. Comments/suggestions are Phases 5/6.
- Hidden Liveblocks features: `comments:false`, `mentions:false` until Phase 5.
- Image `src` is `/api/blob/<id>` plus a `blobId` attr (spec: `blob/<id>`).
- F11 "Ask Claude to edit" toolbar action is Phase 4.

## Phase 1 — Design system: DONE

- `styles/tokens.css` (spec §4.2 verbatim + dark additions), `styles/components.css`, `lib/theme.ts` (pre-paint theme script, system default, persisted toggle).
- `components/ui/*` (Button, Input/Textarea, Select, Dialog, Popover, Tooltip, Menu, Toast, Avatar/stack, Badge, Switch, Segmented, Skeleton, Kbd, icons, theme toggle), `components/doc/parts.tsx` (chips, pending, slash menu, toolbar, block handle, tab tray item, table + 7 swatches, comment card/composer, suggestion card, version list, share dialog, export menu, presence pill, Ask Claude panel, template card), `components/brand/Mark.tsx`, `app/icon.svg`.
- `/design` renders every token (parsed from tokens.css) and component in light and dark side by side. Landing skeleton at `/`.
- Tests: axe on both panes = 0 serious/critical; 3 screenshot baselines (`tests/e2e/design.spec.ts-snapshots`).

**Deviations (logged)**
- Fonts via `@fontsource-variable/*` instead of `next/font` (no build-time network dependency). Same families.
- `--cn-text-meta` light `#87867f` -> `#6b6a64` (spec value is ~3.4:1, fails AA). Dark muted/meta lightened (`#adaba2` / `#9a988f`).
- Done-task opacity 55% -> 65% (55% fails AA).
- Versions list is a button list, not a listbox (axe aria-required-children).
- Side-by-side check against claude.ai: NOT done (no access to compare). Tokens tagged [D] remain unverified.
- Playwright baselines are Linux/Chromium only; regenerate on another OS.

## Phase 0 — Foundation: CODE DONE, 3 items need owner accounts

**Done & verified locally** (`pnpm build && pnpm test` green; lint, typecheck, e2e smoke green)
- Next.js 16 (App Router), React 19, TS 5.9 strict, Tailwind v4, ESLint 9, Prettier, Vitest 5, Playwright 1.65, pnpm.
- `lib/brand.ts` (BRAND constant), `styles/tokens.css` (stub; full set in Phase 1), `.env.example`.
- `supabase/migrations/0001_init.sql`: all §6 tables + RLS on every table + helper fns + owner auto-member trigger + private `blobs` bucket.
- Two-user RLS test (`tests/rls/rls.test.ts`) runs the real migration in PGlite with an `auth`/`storage` shim. 8 tests: stranger sees/writes nothing, viewer read-only, editor can write but not share/delete, no self-escalation, every public table has RLS.

**Decisions / deviations**
- TypeScript pinned to 5.9, not 7.0.x (7 is the native rewrite; too new for Next tooling). ESLint pinned to 9 (eslint-config-next peer `>=9`).
- Spec bug found by the RLS test: `INSERT … RETURNING` hits the SELECT policy before the owner-member trigger fires, so owners could not create notebooks. Fixed: `notebooks_select` also allows `owner_id = auth.uid()`.
- RLS test uses PGlite, not a live Supabase. It proves the policies, not Supabase's `auth.uid()`/JWT wiring. Re-run against the real project once it exists.
- `PW_CHROMIUM_PATH` env var lets Playwright use a preinstalled Chromium (sandbox only; unset elsewhere).
- Package checks (npm, 2026-11-12): `tiptap-track-changes` is 0.2.1, `@liveblocks/react-tiptap` 3.25, `@tiptap/react` 3.33, `@anthropic-ai/sdk` 1.8. Not installed yet (later phases).

**NOT done — needs the owner (I will not create these without you)**
1. Vercel project + deploy preview ("deploy preview loads").
2. Supabase project; apply `0001_init.sql`; real-project RLS run.
3. Env values in Vercel + `.env.local` (ANTHROPIC_API_KEY, Supabase, Liveblocks).

**Update:** owner added Vercel env vars and ran 0001_init.sql in Supabase (not independently verified: sandbox network blocks the Supabase host).
