# Project rules

Product: AI-native docs + slides editor (working name "Draftly"). Standalone web app Jude will sell.

## Source of truth
- replica/recon.md and replica/features.csv. Refer to screens and flows by ID (S05, F02).
- Update the `clone` column in features.csv as features ship.

## Clean-room rules
- Built from public information only. Do not fetch, read or copy claude.ai source, bundles, private APIs or network calls.
- No Anthropic or Claude branding anywhere: no logo, no "Claude" in the UI, no copied palette or proprietary/licensed fonts. The AI provider can be any model API, used under this product's own brand.
- Screenshots in replica/screens/ are reference only and never ship.

## Build order
1. Docs MVP: F01, F02, autosave, library (S02), share (S09), export DOCX/PDF.
2. Comments + @AI (F03), tabs, templates.
3. Slides: editor (S07), present (S08), design system (S11), PPTX/PDF export.
4. Collaboration and Google export last.

## Engineering
- Rich-text: a schema-based editor (e.g. ProseMirror/Tiptap) so AI edits are document operations.
- Stream AI output as operations; the user can stop a draft mid-way and undo any AI edit in one step.
- Server-side permission check on every AI and write call.
- API keys only in env vars, never in the client or the repo.
