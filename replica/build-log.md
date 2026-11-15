# Build log

Step 3 of the Replica pack (`/replica-build`). One line per screen, then what changed from the plan and what was harder than expected.

Status on 2026-11-15: **the foundation and the first slice (F01 + F02) are built. The build step is not finished.** 4 of 14 screens are done, 2 are partly done, 8 are routes with a plain "not built yet" page or a disabled button.

Everything runs with no outside service: accounts and documents are held in the server's memory (`lib/data/memory.ts`), live documents sync through a small local transport (`lib/rooms`), and the AI is a scripted stand-in (`lib/ai/scripted.ts`) that follows the real tool contract with canned text. The UI labels it "Demo AI". `/replica-backend` replaces all three behind the same interfaces.

## Screens

| ID | screen | date | status | what is missing |
| --- | --- | --- | --- | --- |
| S01 | Sign in / sign up | 2026-11-15 | done | Google button is shown disabled (needs the real accounts). States: empty, error, loading |
| S02 | Library | 2026-11-15 | done | States: empty, filled, no matches, loading, error. Owner menu: rename, delete |
| S03 | Template picker | 2026-11-15 | partial | A template row on the library (4 doc templates). No dialog, no deck templates |
| S04 | Workspace: chat + editor | 2026-11-15 | done | States: idle, questions, drafting, stopped, error, phone (stacked). Share and Export buttons are disabled |
| S05 | Doc editor | 2026-11-15 | done | States: empty, drafting, filled, read-only, reconnecting, failed. No tabs, comments, images or charts yet |
| S06 | Comments | - | not built | Comment button in the selection menu is disabled |
| S07 | Slide editor | - | not built | Decks can be created and listed; opening one says the editor is not built |
| S08 | Present | - | route only | `/a/:id/present` says it is not built |
| S09 | Share dialog | - | not built | Button disabled. The design-system component exists |
| S10 | Export menu | - | not built | Button disabled. The design-system component exists |
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

- 74 unit tests. They cover the document core, the whole AI pipeline without a browser (draft, Stop, a person typing during a draft, permissions, selection edits, undo, the daily allowance), and a 3,000-run randomised test that a selection edit never changes text outside the selection.
- 25 browser tests, driving the real app: sign in, library, F01, F02, permissions, phone layout, accessibility.
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

## Not done in this step, said plainly

- 8 of the 20 must-haves are not started: share by email, export doc, export deck, and all five slide features.
- 7 must-haves are partial: they work, on demo data or with the scripted model.
- 5 must-haves are done: library, chat beside the editor, rich text, owner-only rename and delete, AI acts with the asker's permissions.
