# Build log

Step 3 of the Replica pack (`/replica-build`). One line per screen, then what changed from the plan and what was harder than expected.

Status on 2026-11-15: **the foundation, the first slice (F01 + F02), sharing and export are built. The build step is not finished.** 6 of 14 screens are done, 2 are partly done, 6 are routes with a plain "not built yet" page or a disabled button.

Everything runs with no outside service: accounts and documents are held in the server's memory (`lib/data/memory.ts`), live documents sync through a small local transport (`lib/rooms`), and the AI is a scripted stand-in (`lib/ai/scripted.ts`) that follows the real tool contract with canned text. The UI labels it "Demo AI". `/replica-backend` replaces all three behind the same interfaces.

## Screens

| ID | screen | date | status | what is missing |
| --- | --- | --- | --- | --- |
| S01 | Sign in / sign up | 2026-11-15 | done | Google button is shown disabled (needs the real accounts). States: empty, error, loading |
| S02 | Library | 2026-11-15 | done | States: empty, filled, no matches, loading, error. Owner menu: rename, delete |
| S03 | Template picker | 2026-11-15 | partial | A template row on the library (4 doc templates). No dialog, no deck templates |
| S04 | Workspace: chat + editor | 2026-11-15 | done | States: idle, questions, drafting, stopped, error, phone (stacked), access removed while open |
| S05 | Doc editor | 2026-11-15 | done | States: empty, drafting, filled, read-only, reconnecting, failed. No tabs, comments, images or charts yet |
| S06 | Comments | - | not built | Comment button in the selection menu is disabled |
| S07 | Slide editor | - | not built | Decks can be created and listed; opening one says the editor is not built |
| S08 | Present | - | route only | `/a/:id/present` says it is not built |
| S09 | Share dialog | 2026-11-15 | done | States: private, shared, invited (no account yet), error, loading, read-only for non-owners (with Leave). No link sharing yet (a "should"). No email is sent |
| S10 | Export menu | 2026-11-15 | done for docs | Word, PDF, Markdown. States: idle, working, done, error. Deck formats wait for slides |
| S11 | Design system setup | - | route only | `/settings/design-system` |
| S12 | Shared view page | 2026-11-15 | partial | A doc shared with you opens with your role (read-only for a viewer). The link route `/s/:token` is a placeholder |
| S13 | Change attribution | - | not built | Each AI run is already recorded with who asked |
| S14 | Account and billing | - | route only | `/settings` |

Screenshots of every built state: `replica/clone-screens/`.

## Definition of done, for the four finished screens

- Every state from the recon, plus empty, error and loading: yes.
- 390px and 1440px wide: yes (browser test for 390; screenshots for both).
- Keyboard only: F01 completes from the keyboard (browser test). The chat can be resized with arrow keys.
- No console errors: yes, checked while driving F01.
- No copy borrowed from the original: yes. A test fails if another company's name appears on the pages.
- Accessibility: axe finds no serious or critical issue on sign in, library, workspace and `/design`.

## Tests

- 96 unit tests. They cover the document core, the whole AI pipeline without a browser (draft, Stop, a person typing during a draft, permissions, selection edits, undo, the daily allowance), sharing rules, the exported files, the model connection (with a recorder in place of the network), and a 3,000-run randomised test that a selection edit never changes text outside the selection.
- 29 browser tests, driving the real app: sign in, library, F01, F02, permissions, sharing between two people, export downloads, phone layout, accessibility.
- Not tested, because it does not exist yet: anything against a real database, realtime host or model.

## Changes from the plan (architecture.md)

1. **The old operation engine was replaced, not kept.** The plan said to keep its internals. Reading it closely, its whole shape (targets, content kinds, block tokens, byline, chips, error codes) was the old spec's contract. I wrote a smaller core for Draftly's own contract in `lib/doc` (about 450 lines) with its own tests. The old engine and its tests are in git history.
2. **A selection is pinned by block id, offset and its text**, not by Yjs relative positions. Same guarantee, and it can be tested without a browser. If text is typed before the selection in the same paragraph, it is found again by its words; if the selected words themselves change, nothing is written.
3. **Stop is a request to the server**, not a dropped connection. A dropped connection raced with the server recording what it had kept. Closing the tab still stops the run.
4. **A local live-document transport was added** (`/api/rooms/:room`, updates down by SSE, up by POST). It was not in the plan. It lets the whole product run, be demoed and be tested with no accounts. The hosted realtime wiring was removed from the editor and returns in the backend step.
5. **Dropped for now**: tabs UI (the rules in `lib/tabs.ts` are kept and tested), images and uploads, the special code-block renderers. Dropped for good, as approved: byline, chips, dropdown lists, the widget stub, the old spec and progress log, the old database migrations (`replica/schema.sql` is the baseline for the backend step).
6. **The Doc / Slides picker exists** although it is a "could". It is part of the prompt box and is the only way to create a deck from the library.
7. **Undo is by block.** If a person edits a block the AI wrote and then the AI change is undone, the person is shown that block and asked before it is replaced.

## Harder than expected

- **Two copies of the Yjs library in the server bundle.** The build prints "Yjs was already imported". Handing a live Yjs object from one copy to the other fails silently. The local store therefore keeps every room as bytes and never shares live objects. The warning remains and is harmless here.
- **Replacing a selection across paragraphs** without disturbing its neighbours. The fix was to stop trusting the editor library's fitting and to check the result: the server compares everything before and after the range, ignoring ids, and refuses any replacement that changed either.
- **Titles.** The library title follows the document's title only while the doc is still "Untitled". After that only the owner renames it, so an editor typing in the page cannot rename the doc.

## Added on 2026-11-15, after the first slice was merged

- **Sharing (S09).** Share by email with view or edit access, change it, remove people, leave. An address with no account is recorded as an invite and gets access when that person signs up with it. If access is removed while someone has the doc open, their page stops updating within seconds and says why.
- **Export (S10).** Word, PDF and Markdown, built on the server from the live document. The Word file was opened in LibreOffice and its headings, table, lists and link are real Word structures. PDF uses headless Chromium: proven locally, not yet on the serverless host.
- **The real model connection** (`lib/ai/anthropic.ts`). Written against the current API reference and unit-tested with a recorder in place of the network: request shape, replaying its own reasoning blocks, refusals, cut-off replies, malformed tool input. **It has never run against the real API**: the only key in this environment is not a model key (the API rejects it). `pnpm eval:ai` runs F01, F02, a chat edit, undo and a permission check against the real model as soon as `AI_API_KEY` is set.
- **Tool input is now checked against its schema before anything runs**, and a reply that was cut off or declined never runs its tool calls.

## Added later on 2026-11-15: getting ready to prove the real model

- The model key is read from `AI_API_KEY` or `ANTHROPIC_API_KEY`.
- **Guard for the public site.** While sign-in is the demo kind (one published demo account), the production site keeps the scripted AI even when a key is set, so a stranger cannot spend it. Previews and local runs use the real model. `ALLOW_PUBLIC_DEMO_AI=1` overrides this. Covered by `tests/unit/evals.test.ts`.
- **Live check in one request.** `GET /api/eval?token=...&scenario=draft|selection|edit` runs one real flow against the real model on in-memory documents and returns pass/fail per check, the document it produced and the tokens used. It answers 404 on production and without the token; only a hash of the token is in the repository. The same checks run locally with `pnpm eval:ai`, and against the scripted model in the unit tests. Calling it resets that server instance's demo data.
- Demo accounts and seed documents have fixed ids, so a session and a link survive a server restart. The library says plainly that storage is demo storage.
- The session cookie is signed with `SESSION_SECRET`, or failing that a value derived from the model key, never the built-in default on a host that has a key.

## Blocked on the owner

1. **Access to the Vercel team**, so the live check can be called on the protected preview where the model key lives. Until then the real model has still never run: the provider is tested against a mocked SDK only.
2. **A database.** The Supabase organisation is on the free plan and already holds its two projects, both for other products. The Supabase address configured in this environment does not answer. Needs a free slot, a paid plan, or another account.
3. **A decision on realtime.** The plan named Liveblocks. An alternative with no extra vendor is to keep live documents in the same Postgres database and use its realtime channel; it also puts the AI's writes under the database's own access rules.

## Not done in this step, said plainly

- 6 of the 20 must-haves are not started: export deck, and all five slide features.
- 8 must-haves are partial: they work, on demo data or with the scripted model.
- 6 must-haves are done: library, chat beside the editor, rich text, private by default, owner-only rename and delete, AI acts with the asker's permissions.
