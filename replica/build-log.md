# Build log

Step 3 of the Replica pack (`/replica-build`). One line per screen, then what changed from the plan and what was harder than expected.

Status on 2026-11-16: **docs (F01 + F02), sharing, export and now slides are built. The build step is not finished.** 9 of 14 screens are done, 2 are partly done, 3 are not built (comments, change attribution, account and billing).

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
| S07 | Slide editor | 2026-11-16 | done | States: empty, drafting, filled, read-only, reconnecting, failed, phone. Elements are text and shapes: no images, charts or comments yet. No Edit with AI on a selection in slides (chat only) |
| S08 | Present | 2026-11-16 | done | States: presenting, notes shown, full screen, no slides. One screen only: no separate presenter window |
| S09 | Share dialog | 2026-11-15 | done | States: private, shared, invited (no account yet), error, loading, read-only for non-owners (with Leave). No link sharing yet (a "should"). No email is sent |
| S10 | Export menu | 2026-11-16 | done | Docs: Word, PDF, Markdown. Decks: PowerPoint, PowerPoint with basic fonts, PDF, web page. States: idle, working, done, error. No slide PNG, no Google export |
| S11 | Design system setup | 2026-11-16 | done | States: default, yours, invalid colour, low contrast refused, saved. One design system per person: no upload of a brand deck, no workspace default |
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
- **Live check in one request.** `GET /api/eval?token=...&scenario=draft|selection|edit|deck` runs one real flow against the real model on in-memory documents and returns pass/fail per check, the document it produced and the tokens used. It answers 404 on production and without the token; only a hash of the token is in the repository. The same checks run locally with `pnpm eval:ai`, and against the scripted model in the unit tests. Calling it resets that server instance's demo data.
- Demo accounts and seed documents have fixed ids, so a session and a link survive a server restart. The library says plainly that storage is demo storage.
- The session cookie is signed with `SESSION_SECRET`, or failing that a value derived from the model key, never the built-in default on a host that has a key.

## Slides milestone, 2026-11-16

What was built: F04 (deck from a prompt), S07, S08 (F05), S11 (F08) and deck export (F07).

- **A slide is a 1280 x 720 board of elements that name roles, not looks.** An element says "accent" or "heading"; the owner's design system says what that means. One change to the design system restyles every deck that person owns, for everyone who opens it. The same rules draw the editor, the thumbnails, present mode, the PDF and the PowerPoint file (`lib/deck/render.ts`).
- **The AI chooses a layout and the words, never positions or colours** (`lib/ai/deck-tools.ts`). Seven layouts place the text and shrink long titles so they stay on the slide. Flow: questions, `lay_out_deck`, then `write_slide` once per slide, each with speaker notes. Edit tools refuse to overwrite a slide a person changed since the AI read it. One undo puts back a whole run; if a person edited since, it names the slide and asks first.
- **Permissions are the same code path as docs.** The run loop serves both kinds; a viewer is refused before the model is called, and every single slide write re-checks the role (tested: access removed mid-run stops the writing).
- **Live editing**: slides and elements are separate shared objects in the deck's live document, so a person and the AI changing different slides at once both keep their change (tested).
- **By hand**: move and resize with the pointer or the keyboard, retype in place, layouts, backgrounds, text size, alignment, colour (design-system colours only), add / duplicate / delete / reorder slides, undo and redo of your own changes.
- **Export**: `.pptx` with real text boxes, bullets, fonts and speaker notes; a basic-fonts variant (Georgia and Arial) for computers without the design system's fonts; PDF with the fonts embedded; one self-contained web page.

Changes from the plan:
1. `slides` rows are not written yet: the deck lives in its live document and the library's search copy. The table arrives with the database.
2. One design system per person, not per workspace, and decks do not pick one: they follow their owner's. Workspaces arrive with the database.
3. Slide text is plain text with three conventions ("- " bullets, bold, italic), not the doc editor's rich text. It keeps slides simple and exports exact.
4. Dependencies added: `pptxgenjs`, `jszip`, six open-licence font packages.

Harder than expected:
- The PowerPoint library writes invalid paragraph settings when a bullet line mixes bold or italic, which made bullets vanish. Found by rendering the file and looking at it; the file is now repaired after it is generated (`repairSlideXml`, tested).
- Selecting an element used to grow the toolbar and push the slide down under the pointer, so a drag landed in the wrong place. The selection toolbar now has a fixed height.
- Each change by hand had to be made its own undo step; otherwise one undo took back several quick actions at once.

Not checked: the `.pptx` was opened in LibreOffice, not in PowerPoint or Keynote. Present mode was driven in headless Chromium only.

## Blocked on the owner

1. **Access to the Vercel team**, so the live check can be called on the protected preview where the model key lives. Until then the real model has still never run: the provider is tested against a mocked SDK only.
2. **A database.** The Supabase organisation is on the free plan and already holds its two projects, both for other products. The Supabase address configured in this environment does not answer. Needs a free slot, a paid plan, or another account.
3. **A decision on realtime.** The plan named Liveblocks. An alternative with no extra vendor is to keep live documents in the same Postgres database and use its realtime channel; it also puts the AI's writes under the database's own access rules.

## Not done in this step, said plainly

- 0 of the 20 must-haves are not started.
- 10 must-haves are partial for one of two reasons: they run on demo data (accounts, autosave, sharing, exports of your own content all work, but nothing is kept), or they have only run with the scripted AI (drafting a doc, Edit with AI, drafting a deck, speaker notes).
- 10 must-haves are done.
- Of the shoulds: comments and @AI, tabs, share by link, change attribution, charts, images, doc into deck, design system from a brand deck, and slide PNG are not built.
