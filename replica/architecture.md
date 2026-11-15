# Architecture: Draftly (an AI-native docs + slides editor)

Step 1 of the Replica pack (`/replica-architect`). Inputs: `replica/recon.md`, `replica/features.csv`, `CLAUDE.md`, `PROMPT.md`.
Outputs: this file and `replica/schema.sql`. Date: 2026-11-14. Status: **approved, option B**.

Seven things changed while building. They are listed in `replica/build-log.md` under "Changes from the plan"; the largest is that the old operation engine was replaced rather than kept.

## 0. What I found before planning

This repository is not empty. It already holds "Claude Notebook" (phases 0 to 4 of `docs/SPEC.md`): a Next.js doc editor with an AI that edits through structured operations. I installed it and ran its tests here: **124 of 124 unit tests pass**. Per its own `PROGRESS.md`, nothing in it has ever been run against a real database, realtime service or model.

That code is close to what Draftly needs, and it conflicts with the new `CLAUDE.md` in four places.

| existing code | conflict with the new rules |
| --- | --- |
| Name "Claude Notebook", "Ask Claude" in the UI, an agent that introduces itself as Claude | "No Anthropic or Claude branding anywhere" |
| `styles/tokens.css` is labelled "spec §4.2 verbatim": the cream, ink and clay values are the ones the old spec says were taken from claude.ai | "no copied palette" |
| `docs/SPEC.md` says its facts were "verified first-hand (Claude Docs connector guides / claude.ai page inspection)" and that it "clones Docs' behavior and design language". The AI tool contract (tool shapes, op names, error codes, block tokens, byline, dropdown chips) follows that | "Built from public information only" |
| Accounts are a name + password with an invented address; editors can rename and delete | features.csv: "Sign up with email or Google", "Share by email", "Owner-only rename and delete" |

### Decision D0 (yours): how much of the existing code Draftly is built on

| option | what it means | cost | clean-room position |
| --- | --- | --- | --- |
| A. Reuse everything, rename the surface | Change the name, strings and colours; keep the AI contract and old-spec features | lowest | weakest: the product's core contract traces to the old spec |
| **B. Keep the foundation, rebuild the surface from the recon (recommended)** | Keep the generic engineering. Replace everything that came from the old spec with parts designed from `recon.md` and Draftly's own needs | about one extra milestone (M0) | good: what ships traces to the public recon |
| C. Greenfield | Throw the code away, start from the recon | highest: re-earn 124 tests | strongest |

I recommend **B**, and the rest of this document assumes it. The reasons: the stack is already exactly what `CLAUDE.md` asks for; the AI contract has to be redesigned anyway (clarifying questions, selection-only edits and decks do not exist in it); and the colours are replaced in `/replica-design` regardless.

Two honest limits. I am not a lawyer, and this is an engineering judgement. And under B the old spec stays in this repo's git history, so before selling, publish from a fresh repository with a clean history (I cannot create repositories from this session).

What B keeps, changes and drops:

| keep (generic, tested) | change | drop (only the old spec asked for it) |
| --- | --- | --- |
| Next.js / Supabase / Tiptap / Yjs setup, lint, test harness | Brand constant, every UI string, AI persona | `docs/SPEC.md` and `PROGRESS.md` as sources of truth |
| Editor: headings, lists, links, tables, images, code blocks, slash menu, selection toolbar, block ids | Design tokens (`/replica-design`) | Byline line under the title |
| Op engine internals: ProseMirror transforms, atomic apply, hash guards, property tests | AI contract: tool names, op vocabulary, error codes, prompt, block token syntax | Dropdown chips and the `enums` table |
| Yjs bridge that writes only a delta, so a person and the AI can edit at once | Database: new baseline from `replica/schema.sql` | `widgets` table and the embed stub |
| Tabs (add, rename, reorder, nest) | Auth: email + Google | Date chips; LaTeX, Mermaid and CSV renderers (not in features.csv) |
| UI component kit structure, Radix primitives | Routes: `/library`, `/a/:id` | "notebook creates itself" flow (Draftly creates the doc first) |

## 1. Stack

One Next.js app, one Postgres database, no microservices. Every row is what the repo already uses unless marked new.

| layer | choice | why |
| --- | --- | --- |
| web | Next.js 16 (App Router) + React 19 + TypeScript strict | Already here and building; server actions and streaming routes cover every flow |
| styling | Tailwind v4 + CSS variable tokens | Tokens are one file, so `/replica-design` swaps the look without touching components |
| editor (docs) | Tiptap 3 on ProseMirror | `CLAUDE.md` requires a schema-based editor so AI edits are document operations |
| live document | Yjs, hosted by Liveblocks, behind the existing `RoomStore` interface | A person and the AI edit the same doc at the same time in F01; only a CRDT merges that without one overwriting the other. Multi-user co-editing (a "could") then costs nothing extra |
| database | Postgres on Supabase | Managed, cheap at zero users, RLS in the database |
| data access | supabase-js as the signed-in user; no ORM | RLS applies to every query, including the AI's. An ORM on a service connection would bypass it |
| auth | Supabase Auth: email + password with confirmation, and Google | features.csv row 1. Confirmed addresses are what make share-by-email safe |
| AI | A model API behind `lib/ai/provider.ts`; today the Anthropic SDK that is already installed | recon: any model API under Draftly's own brand. Model id is one config value |
| files | Supabase Storage, private buckets `blobs` and `exports` | Same vendor, signed URLs after a role check |
| exports (new) | `docx` 9.x for Word; `pptxgenjs` 4.x for PowerPoint; headless Chromium (`puppeteer-core` + `@sparticuz/chromium`) printing an internal page for PDF and slide PNG | One print path serves doc PDF, deck PDF and PNG. Versions checked on npm today |
| email (new) | Resend, also as Supabase's SMTP | Confirmation mail and share invites. Supabase's built-in mail is rate-limited to a few per hour |
| payments (later) | Stripe Checkout + Billing | S14. Not in features.csv, so it waits (see open questions) |
| jobs | Vercel Cron, two daily jobs | Purge and cleanup only; nothing needs a queue yet |
| hosting | Vercel | Already the deploy target |
| mobile | none | Web only; S04 stacks on narrow screens |

## 2. Schema

`replica/schema.sql` is the full target. **19 tables, 42 policies, RLS on every table.** It becomes the baseline migration in `/replica-backend`, applied to a **new** Supabase project (the old one holds invented-address accounts that cannot receive a share).

I ran it in an in-memory Postgres with four test users (`node replica/schema-check.mjs`): **55 of 55 checks pass**, including every permission rule below, "every table has RLS" and "every foreign key is indexed". This proves the SQL and the policies, not Supabase's own session wiring.

| table | recon entity | holds |
| --- | --- | --- |
| profiles | User | name, confirmed email, plan |
| workspaces, workspace_members | Workspace | a personal workspace per person; teams later |
| design_systems | DesignSystem | colours, fonts, component defaults; the default is one pointer on the workspace |
| artifacts | Artifact | a doc or a deck: kind, title, owner, soft-delete time |
| permissions | Permission (user) | who has which role; the owner's row is added by trigger |
| invites | Permission (pending) | shares to an address with no account yet |
| share_links | Permission (link) | one hashed link per artifact, viewer or commenter only |
| doc_tabs | DocTab | tab order, its live room, a searchable mirror of the content |
| slides | Slide | mirror of the deck: layout, elements, speaker notes |
| blobs | (images, uploads) | immutable file records |
| conversations, messages | Conversation, Message | the chat beside the editor, private per person |
| ai_runs, ai_usage_daily | (new) | one row per AI request: cost, range, undo record; the daily cap |
| comments | Comment | threads anchored to a mark in the text, 1000 characters |
| revisions | Revision | who changed what: a person or the AI |
| templates | Template | global starting points |
| export_jobs | ExportJob | format, status, expiring file |

Rules enforced in the database, each one tested:

- **Private by default.** A new artifact has one permission row, the owner's. A stranger sees no artifact, tab, comment or profile.
- **Roles.** Viewer reads and exports. Commenter also comments. Editor also writes content. Only the owner renames, deletes or shares.
- **Owner-only rename.** Only the owner can update the `artifacts` row at all. Editors change content, which lives elsewhere. The owner cannot hand the row away or add a second owner.
- **Owner-only delete.** `delete_artifact()` soft-deletes; a deleted artifact has no readers; a daily job purges after 30 days.
- **No self-promotion.** Nobody can add or raise their own access, pose as the AI in a comment, or set their own plan.
- **A commenter cannot ask the AI** (recon F03 edge): `mentions_ai` needs edit rights.
- **Invites need a confirmed address.** An unconfirmed sign-up claims nothing.
- **Links never grant edit and never downgrade** someone who already has a role. Signed-out visitors cannot redeem one.
- **Chat is private.** A shared viewer cannot read the owner's prompts.
- **AI cap is atomic**, one statement per start, callable by the server only.

## 3. How the AI writes (the non-negotiables)

This is the hard part of the product, so the contract is fixed here.

| rule | how it is guaranteed |
| --- | --- |
| The AI writes structured operations, never a blob | The model can only call tools. Each tool call becomes ProseMirror steps, applied atomically, written to the live doc as a Yjs delta. Chat text is never inserted into the document |
| Clarifying questions first (F01) | A tool `ask_questions` (1 to 3 questions, optional choices). The run ends as `awaiting_answers`, the questions are saved as a message and shown as a card with "Skip, just draft". The answers start the next run |
| The draft streams in | The AI lays out the title and one placeholder per section, then fills one section per call. Each call lands in the editor as it completes, with a progress line ("drafting section 2"). If that feels jumpy, the same pipeline commits per paragraph by reading the tool input as it streams |
| "Edit with AI" changes only the selection (F02) | True by construction, not by the model behaving. The client sends the range as Yjs relative positions plus the selected text. The server pins that range, gives the model only the selection, a little read-only context and one tool, `replace_selection`. The server performs the single replace itself, then checks that everything outside the range is identical before committing. The general edit tool does not exist in this mode |
| The AI acts with the asker's permissions | The route resolves the role through the asker's own session (RLS) before any model call: viewer and commenter get 403. The tool list is built from the role. The role is re-checked before every write, so access revoked mid-run stops the run |
| Stop mid-draft | The client aborts the request, the server aborts the model. What was written stays; unfilled placeholders are removed in one operation |
| Undo any AI edit in one step | Every run stores what it replaced. "Undo" on the AI's message applies the inverse as a new edit by the same person. If someone has edited those blocks since, it names them and asks first |
| People win conflicts | Every whole-block edit carries the block's hash; a mismatch means a person changed it, and the AI re-reads instead of overwriting (already built and property-tested) |

## 4. API

Server actions for form-like writes, route handlers for streams, files and webhooks. "Editor+" means owner or editor. Every write re-checks the role on the server; RLS is the second lock.

### Account (S01, S14)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| action `signUp` | create account, send confirmation | anyone | email, password, name | "check your mail" or error | S01 |
| action `signIn` | password sign-in | anyone | email, password | redirect `/library` | S01 |
| action `signInWithGoogle` | start Google sign-in | anyone | - | redirect to Google | S01 |
| GET `/auth/callback` | finish sign-in, then `claim_invites()` | anyone | code | redirect | S01, F06 |
| POST `/auth/signout` | end session | signed in | - | redirect `/login` | S01 |
| action `updateProfile` | change name or avatar | self | name, avatar | profile | S14 |

### F01 Write a doc from a prompt (S02, S03, S04, S05)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| GET `/library` | list what I own or was given | signed in | `q`, `kind` | cards | F01 |
| action `createArtifact` | create doc or deck + first tab + conversation | signed in | kind, templateId?, prompt? | redirect `/a/:id` | F01, F04 |
| GET `/a/[id]` | workspace: chat + editor | any role | - | page, role-aware | F01 |
| POST `/api/rooms/auth` | token for the live doc, scoped by role | any role | room | token (read or write) | F01 |
| POST `/api/ai/runs` | run the AI, streamed | editor+ | artifactId, tabId, mode `chat`, message or answers | SSE: status, text, questions, section, done, error | F01 |
| POST `/api/ai/runs/[id]/undo` | put back what that run changed | editor+, the asker | confirmOverwrite? | changed blocks or conflicts | F01, F02 |
| action `addTab` / `renameTab` / `moveTab` / `deleteTab` | manage tabs | editor+ | tab fields | tab list | F01 |
| POST `/api/upload` | add an image | editor+ | file (10 MB, image types) | blob id | F01 |
| GET `/api/blob/[id]` | serve a file | any role | - | 5-minute signed redirect | F01 |

### F02 Change a passage with AI (S05)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| POST `/api/ai/runs` | rewrite only the pinned range | editor+ | mode `selection`, tabId, range (relative positions + text), instruction | SSE: status, done or error | F02 |

### F03 Ask the AI in a comment (S06)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| action `createComment` | new thread or reply | commenter+ (`@AI` needs editor+) | anchor or parentId, body | comment | F03 |
| action `resolveComment` | resolve or reopen | author or editor+ | id | comment | F03 |
| action `deleteComment` | remove | author or owner | id | - | F03 |
| POST `/api/ai/runs` | AI replies in the thread and edits the passage | editor+ | mode `comment`, commentId | SSE | F03 |

### F04 Build a deck, F05 Present (S07, S08)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| POST `/api/ai/runs` | draft slides and speaker notes as slide operations | editor+ | mode `chat` on a deck | SSE | F04 |
| GET `/a/[id]/present` | full-screen presenting | any role | - | page | F05 |

Slide edits by hand go through the deck's live room, like doc edits; they need no route.

### F06 Share (S09, S12)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| action `shareByEmail` | give a role, or invite if no account; send mail | owner | email, role | "shared" or "invited" | F06 |
| action `updateRole` | change someone's role | owner | userId, role | list | F06 |
| action `removeAccess` | remove someone, or leave | owner, or self | userId | list | F06 |
| action `setShareLink` | create, rotate or revoke the link | owner | role or off | link (shown once) | F06 |
| GET `/s/[token]` | open a shared link | signed in (else to `/login` and back) | - | redirect `/a/:id` | F06 |
| action `renameArtifact` | rename | owner | title | title | F06 |
| action `deleteArtifact` | delete | owner | id | redirect `/library` | F06 |

### F07 Export (S10)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| POST `/api/exports` | make a file | any role | artifactId, tabId?, format | job id | F07 |
| GET `/api/exports/[id]` | status and download | the requester | - | status, signed URL | F07 |
| GET `/print/[id]` | print layout for headless Chromium | server only, one-time signed token | token | HTML | F07 |
| GET `/api/google/connect`, `/api/google/callback` | link a Google account for Docs / Slides export | signed in | - | redirect | F07 (could) |

### F08 Design system (S11)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| action `saveDesignSystem` | create or edit, with a contrast check | workspace member | colours, fonts | design system or contrast errors | F08 |
| action `setDefaultDesignSystem` | make it the workspace default | workspace owner | id | - | F08 |
| action `deleteDesignSystem` | remove | workspace member | id | - | F08 |
| POST `/api/design-systems/import` | build one from an uploaded brand deck | workspace member | .pptx | draft design system | F08 (should) |

### Billing (S14, after the musts)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| POST `/api/billing/checkout` | start a subscription | signed in | plan | Stripe URL | S14 |
| POST `/api/billing/portal` | manage it | signed in | - | Stripe URL | S14 |

**Total: 40 routes and actions, plus the 2 webhooks below.**

Webhooks in:
- `POST /api/webhooks/realtime` from Liveblocks when a document changes: writes the content mirror to `doc_tabs` / `slides`, bumps `artifacts.updated_at`. This is what "Autosave" and library search rest on.
- `POST /api/webhooks/stripe`: plan changes.

Webhooks out: none.

Jobs:
- `purge-deleted`, daily: hard-delete artifacts soft-deleted more than 30 days ago, their rooms and files.
- `expire-exports`, daily: delete export files past `expires_at`.

Only official, public APIs with your own keys: Supabase, Liveblocks, the model provider, Resend, Stripe, Google.

## 5. The parts that bite

- **Selection range on a moving document.** The range is pinned with Yjs relative positions, so it survives edits elsewhere. If text inside it changes while the AI works, nothing is written and the person is told. A selection across table cells snaps to whole cells or is refused with a reason.
- **Undo on a shared document.** Undo is a new forward edit, never a rewind, so it cannot erase a collaborator's later work without asking.
- **Races.** AI against person: hash guards plus CRDT merge. Two shares of the same address: unique keys with upserts. Double-clicked "New": the id is generated by the client action once.
- **Idempotency.** Webhooks arrive twice and out of order. The mirror always re-reads the current document instead of applying the event, and Stripe events are deduplicated by event id.
- **Long runs.** A function lives 300 s at most on Vercel (depends on your plan). The run stops itself at 270 s, says so, and what is written stays. The daily cap is counted before the model is called.
- **Prompt injection.** Document text, comments and uploads are data. The system prompt says so, and the stronger defence is structural: the AI holds only the asker's rights and only document tools, so there is nothing more to steal.
- **Cost.** One draft is many model calls. Usage is recorded per run; the cap is per person per day; plans raise it later.
- **Mirror lag.** Search and export read the mirror, which trails the live doc by seconds. Export forces a fresh read first.
- **Export fidelity.** Tables and images in Word; Chromium inside a serverless function is known to be fiddly (size and cold start); fonts in PowerPoint fall back to "basic fonts" (recon F07). The fallback for PDF is the browser's print dialog.
- **Email deliverability.** Needs your own domain with SPF and DKIM in Resend, or invites land in spam.
- **Search.** Postgres full text on titles and mirrored text. Enough until there are many thousands of documents per person.
- **Time zones.** Stored in UTC, shown in the browser's zone. The AI is told today's date in the asker's zone. The daily cap resets at midnight UTC.
- **File limits.** Images 10 MB, image types only, checked on the server before the write.
- **Deletion (GDPR).** Deleting an account cascades through every table; the purge job removes rooms and stored files, which the database cannot cascade to.
- **Vendor lock.** The live doc sits behind a three-method interface (`ensure`, `load`, `save`) and is mirrored into Postgres, so the realtime vendor can be swapped.
- **Offline.** Not supported; the editor shows "reconnecting" and keeps local edits until it syncs.

## 6. Build order

Order follows `CLAUDE.md`. Every "must" ships before any "could". The four "skip" rows stay skipped.

**M0. Re-base (decision D0, option B).** No new features.
- Brand constant to "Draftly"; remove every Claude string; AI is called "AI" in the UI.
- Baseline migration from `replica/schema.sql`; port the permission checks into the test suite.
- Email + Google sign-in. Routes `/library` and `/a/:id`.
- Redesign the AI contract from section 3; drop the byline, chips, enums and widget stub.
- Done when: lint, types, unit and browser tests are green, and a search for the old name finds only the SDK package and its key name.

**M1. Vertical slice: F01 + F02.** The core loop, ugly, on a real deploy.
- Screens: S01 (plain), S02 (list + New), S04, S05.
- Tables: profiles, workspaces, workspace_members, artifacts, permissions, doc_tabs, conversations, messages, ai_runs, ai_usage_daily.
- Routes: account (5), `createArtifact`, `/library`, `/a/[id]`, `/api/rooms/auth`, `/api/ai/runs` (chat + selection), `/api/ai/runs/[id]/undo`.
- Done when, with real keys: a prompt gets questions, the answers produce a doc that fills in section by section; Stop keeps what is written; "Edit with AI" changes only the selection (a test compares everything outside the range before and after); Undo restores it; a viewer is refused.

**M2. Docs MVP, the rest of the doc musts.**
- Autosave + content mirror (webhook); rich text checked against the list; library search and type filter (S02); share by email with viewer and editor (S09); shared view and read-only state (S12); owner-only rename and delete; export to Word and PDF (S10).
- Tables added: invites, blobs, export_jobs.

**M3. Doc shoulds.** Tabs (built; verify), comments and `@AI` (F03, S06), commenter role, share by link, change attribution (S13), templates (S03), Markdown export, charts in docs.
- Tables added: comments, share_links, revisions, templates.

**M4. Slides.** Musts first: deck from a prompt (F04), slide editor (S07), speaker notes, present (S08, F05), design system (S11, F08), PowerPoint and PDF export. Then the slide shoulds: brand-locked colour picker, design system from a brand deck, HTML and PNG export, doc into deck, charts in slides.
- Tables added: slides, design_systems.

**M5. Coulds.** Google Docs and Slides export, co-editing verified with two people, workspace sharing and default design system, files as AI context, Output picker, comment emails, version restore. Billing (S14) here unless you move it up.

**M6. Fixes** from `/replica-entrepreneur`, once it has run.

## 7. Risks, ranked

1. **Selection-only edits and one-step undo on a live shared document.** Easy to get 95% right; the last 5% is concurrent edits. Mitigation: the server does the replace itself and proves the outside is untouched; property tests like the ones already in the repo.
2. **Nothing here has met real services.** 124 tests pass against stand-ins. M1 is defined as passing on a real deploy with real keys for that reason.
3. **Export fidelity and the slide canvas.** Word, PDF-on-serverless and PowerPoint each have known rough edges, and the slide editor is the largest single build (recon size: L).

## 8. What I need from you

For approval:
1. **D0**: option B as recommended, or A or C.
2. **New Supabase project** for Draftly, rather than migrating the old one.
3. **Liveblocks stays** as the realtime host (it is a paid service past its free tier), or you prefer self-hosting later.
4. **Order**: `CLAUDE.md` puts doc shoulds (M3) before slide musts (M4). Say so if you want every must first.
5. **Billing**: S14 is in the recon but has no row in features.csv. Add a row, or leave it for M5.

Accounts and keys, before M1 can be proven live (in env vars only, never in chat or the repo): Supabase project (email confirmation on, Google provider on), a Google OAuth client, Liveblocks keys and webhook secret, a model API key, Resend with your sending domain. Stripe later.

Next step after approval: `/replica-design`.
