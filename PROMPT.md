# Build prompt for Claude Code

Paste this into Claude Code from inside this folder.

---

I'm building a standalone web product: an AI-native document and slide editor, like Google Docs and Google Slides, where an AI drafts and edits the work live inside a real editor beside a chat. It is modeled on how Claude Docs and Claude Slides work, but it is my own product with my own name, brand and design system.

The recon is already done with my Replica plugin. Read these first:
- replica/recon.md (screens S01-S14, flows F01-F08, components, data model, sources)
- replica/features.csv (45 features: must / should / could / skip)
- CLAUDE.md (project rules)

Run the rest of the Replica pack in order, stopping for my approval at the end of each step:

1. /replica-architect: pick the stack, write the schema and API, and plan a thin vertical slice first. The first slice is flow F01 (prompt -> clarifying questions -> AI drafts a doc live into the editor) plus F02 (select text -> Edit with AI). Docs ship before Slides.
2. /replica-design: build an ORIGINAL design system with the same feel as Claude's editors: warm neutral backgrounds, one muted accent colour, a serif for headings and a clean sans for UI, quiet chrome, generous spacing, the document as the hero. Do not use Anthropic's logo, exact palette or typefaces. Use free fonts (Google Fonts) and run the contrast check.
3. /replica-build: build screen by screen from the recon IDs, all states (empty, loading, drafting, filled, error, read-only), ticking off features.csv as you go.
4. /replica-backend: auth, database, permissions (viewer / commenter / editor, private by default, owner-only rename and delete), the AI integration, and exports (DOCX, PDF, PPTX).
5. /replica-test, then /replica-diff to score parity against features.csv.

Non-negotiables:
- The AI writes structured editor operations into the document, never a pasted blob, and "Edit with AI" changes only the selected range.
- The AI always acts with the asking user's permissions; a viewer can't get the AI to edit.
- Every "must" row in features.csv before any "could" row.
- Leave the 4 "skip" rows skipped.

Use a placeholder product name ("Draftly") until I run /replica-brand.
