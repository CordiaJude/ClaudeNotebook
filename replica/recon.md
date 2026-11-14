# Recon map: Claude Docs + Claude Slides (web)

Scope: the document editor (Claude Docs) and the slide editor (Claude Slides), the AI that drafts and edits inside them, the library that holds them, sharing, comments, export and the brand design system. Not in scope: chat as a product, interactive/app artifacts, dashboards, Claude Design canvases, Claude Code.
For: a standalone web product Jude sells (an AI-native Google Docs + Slides).
Date: 2026-11-14
Method: public sources only (help center, product pages, release coverage, third-party walkthroughs). No source code, bundles or network calls were read. Anthropic's terms restrict using Claude to build competing products, so the clone is built from this public map, not from studying Claude's internals.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | help center: what are artifacts | https://support.claude.com/en/articles/9487310 | artifact types; export formats for docs and decks |
| 2 | help center: Claude Docs | https://support.claude.com/en/articles/16923645 | rich-text doc saved to account; Claude acts with the asker's permissions |
| 3 | help center: share artifacts | https://support.claude.com/en/articles/9547008 | share dialog, roles, sign-in to view |
| 4 | help center: invite outside org | https://support.claude.com/en/articles/16989529 | external invite limits, commenter/editor rights |
| 5 | product page: artifacts | https://claude.com/features/artifacts | positioning; edit on canvas, comment for Claude, share link, export |
| 6 | docs: comments (Science app) | https://claude.com/docs/claude-science/comments | comment UX: select > Comment > badge/pin; send to Claude |
| 7 | guide: how to use Claude Docs | https://promptoptimizer.tools/blog/how-to-use-claude-docs | /docs command, Output > Docs, templates, @Claude in comments |
| 8 | guide: Claude Docs (Panaversity) | https://agentfactory.panaversity.org/md/claude-and-chatgpt-2/build-something/docs.md | Edit with Claude on a selection, change attribution, roles, no trash |
| 9 | guide: Claude Slides limits | https://deckary.com/blog/claude-slides | editing modes, design system, downloads list |
| 10 | guide: Claude Slides beginners | https://go9x.com/blog/how-to-use-claude-slides | palette locked to brand, speaker notes, exports |
| 11 | review: Claude Slides | https://www.eesel.ai/blog/claude-slides-review | product tagline, present mode |

## Core loop

Ask for a document or deck in plain language, the AI drafts it live in a real editor beside the conversation, then you and the AI refine it (by hand, by selecting text, or by comment) and share or export it.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Sign in / sign up | /login | account (viewers must sign in too) | email, Google button | empty, error |
| S02 | Library (Artifacts tab) | /library | all docs and decks you own or that are shared with you | grid/list cards, type filter, search, New button, template row | empty, filled, loading |
| S03 | Template picker | New > Docs or Slides | start from a template instead of a prompt | template cards by type | filled |
| S04 | Workspace: chat + editor split | /a/:id | conversation on one side, the document or deck on the other | chat panel, prompt box with Output picker (Docs / Slides), editor pane, resize handle | drafting (streaming), idle, error, mobile (stacked) |
| S05 | Doc editor | inside S04 | rich-text writing | toolbar, headings, tables, charts, tab bar (multi-tab docs), selection menu with "Edit with AI" | empty, drafting, filled, read-only (viewer) |
| S06 | Comments panel / inline badges | select text > Comment | discuss and ask the AI to change a passage | comment badge, composer, @AI mention, comment list | none, open, sent to AI |
| S07 | Slide editor | inside S04 | build and edit a deck | thumbnail rail, slide canvas with movable elements, speaker notes, brand-locked colour picker | empty, drafting, filled, read-only |
| S08 | Present mode | Present button | full-screen presenting | slide, next/prev, notes (presenter) | presenting |
| S09 | Share dialog | Share button | invite people, set roles, copy link | people input, role select (viewer / commenter / editor), link toggle | private, shared, external-blocked |
| S10 | Export menu | Export / Download | take the work elsewhere | doc: Word, PDF, Markdown, Google Docs; deck: PPTX, PDF, HTML, PNG of slide, Google Slides | idle, exporting, done, error |
| S11 | Design system setup | Settings > Design system, or attach a brand file | set colours, fonts, components that every deck follows | palette editor, font pickers, sample slide preview | none set, set, default |
| S12 | Shared view page | shared link | read (or edit, per role) someone else's doc/deck | header with owner, editor in view mode | sign-in required, no access, view, edit |
| S13 | Change attribution / history | doc menu (medium confidence) | see who changed what: a person or the AI | change list with author type | filled |
| S14 | Account and billing | /settings | plan, usage, profile | plan cards, usage meter | free, paid |

## Flows

```
F01 Write a doc from a prompt
    S02 -> S04 (type request, AI asks 1-3 clarifying questions, answer) -> S05 draft streams in
    happy path clicks: 3 (New, send prompt, answer questions)
    edge: AI misreads the ask, user stops mid-draft, very long doc, user edits while AI drafts

F02 Change a passage with AI
    S05 select text -> "Edit with AI" -> type instruction -> AI rewrites only the selection
    happy path clicks: 3
    edge: selection spans a table, user lacks edit rights (AI must refuse), undo after AI edit

F03 Ask the AI in a comment
    S05 select -> Comment -> "@AI make this warmer, keep the numbers" -> AI replies and edits, says why
    happy path clicks: 3
    edge: commenter role (cannot ask AI), conflicting comments on one passage

F04 Build a deck on brand
    S02 -> S04 with Output = Slides -> S07 deck drafts using the design system and speaker notes
    happy path clicks: 3
    edge: no design system set (use default / attached brand file), too many slides, long titles overflow

F05 Present
    S07 -> Present -> S08
    happy path clicks: 1

F06 Share
    S05/S07 -> Share -> S09 add email, pick role -> Send
    happy path clicks: 4
    edge: invitee has no account, external domain blocked, owner-only rename/delete

F07 Export
    S05/S07 -> Export -> S10 pick format -> file downloads (or opens in Google)
    happy path clicks: 2
    edge: fonts missing in PPTX (offer "basic fonts"), charts in DOCX, Google not connected

F08 Set up a design system
    S11 -> enter colours/fonts or upload a brand deck -> preview -> save as default
    happy path clicks: 4
    edge: low-contrast palette, licensed font not available on export
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Button | primary, secondary, ghost, danger, icon | default, hover, focus, disabled, loading | all |
| Prompt box | chat, with Output picker | empty, typing, sending, disabled | S04 |
| Chat message | user, AI, AI-with-questions, AI-progress ("drafting section 2") | streaming, done, error | S04 |
| Rich-text toolbar | full, floating selection menu | default, active mark | S05 |
| Tab bar | doc tabs | one, many, renaming | S05 |
| Table / chart block | table, bar/line chart | editing, read-only | S05, S07 |
| Comment badge + composer | inline badge, image pin, side list | open, saved, sent to AI | S05, S06, S07 |
| Slide thumbnail rail | vertical list | selected, dragging, adding | S07 |
| Slide canvas element | text, image, shape, chart | selected, moving, resizing, locked | S07 |
| Colour picker | brand-locked, free | default | S07, S11 |
| Share dialog | invite, link | private, shared, blocked | S09 |
| Export menu | doc formats, deck formats | idle, working, done, error | S10 |
| Library card | doc, deck | default, hover, shared badge | S02 |
| Modal, Toast, Avatar, Empty state | - | - | all |

## Inferred data model

```
User         id, name, email, avatar_url, plan
             evidence: S01, S14, share by email (3)            confidence: high

Workspace    id, name, owner_id, default_design_system_id
             evidence: org sharing, org design system (3, 9)  confidence: medium

Artifact     id, type (doc | deck), title, owner_id, workspace_id, conversation_id,
             created_at, updated_at, deleted_at (none: no trash per source 8)
             evidence: S02, S04, owner-only rename/delete (3, 8)  confidence: high

DocTab       id, artifact_id, title, position, content (rich-text JSON)
             evidence: multi-tab docs (7)                      confidence: high

Slide        id, artifact_id, position, layout, elements (json), speaker_notes
             evidence: S07, speaker notes (10)                 confidence: high

Conversation id, artifact_id, user_id ; Message id, conversation_id, role, content, created_at
             evidence: S04                                     confidence: high

Comment      id, artifact_id, author_id, anchor (range or point), body (<=1000 chars),
             mentions_ai (bool), status (open | sent | resolved?)
             evidence: S06, (6, 7)                              confidence: medium (resolve state is a guess)

Permission   id, artifact_id, principal (user | link | workspace), role (viewer | commenter | editor)
             evidence: S09, (3, 4, 8)                           confidence: high

Revision     id, artifact_id, author_type (human | ai), author_id, ops (json), created_at
             evidence: change attribution (8)                  confidence: medium

DesignSystem id, workspace_id, colors (json), fonts (json), components (json), is_default
             evidence: S11, (9, 10)                             confidence: high

Template     id, type, title, seed_content
             evidence: S03, templates (7)                       confidence: medium

ExportJob    id, artifact_id, format, status, file_url
             evidence: S10                                      confidence: guess
```

Relationships: Workspace 1-n User, Workspace 1-n DesignSystem, User 1-n Artifact, Artifact 1-n DocTab | Slide, Artifact 1-1 Conversation 1-n Message, Artifact 1-n Comment, Artifact 1-n Permission, Artifact 1-n Revision.

## Feature matrix

See `features.csv`. Must: 20, should: 13, could: 8, skip: 4.

## Out of scope (cannot or should not be cloned)

- Claude's own visual identity: Anthropic's logo, wordmark, exact palette, and its proprietary or licensed typefaces. The clone gets its own design system (replica-design + replica-brand) that keeps the same feel: warm neutrals, a serif for headings, quiet chrome, lots of space, the document as the hero.
- The Claude model itself. The clone calls an LLM API you pay for (Claude via the API is fine to use as the engine; it just can't be branded as Claude).
- Claude's memory, projects, connectors and skills as context sources. Rebuild a simpler version: uploaded files and a per-workspace brief.
- Anthropic's user base and its Google Workspace partnership; you build your own Google OAuth app for the Docs/Slides export.

## Size

Screens 14, flows 8, entities 12. Hard parts: (1) the AI writing into a live rich-text editor as structured edits, not pasted text, including selection-only rewrites; (2) the slide canvas editor with brand-locked styling; (3) export fidelity to DOCX and PPTX (and Google Docs/Slides); (4) real-time multi-user editing with comments anchored to moving text. Size: L (a quarter) for both editors. Docs-only MVP is M (a few weeks); add Slides second.
