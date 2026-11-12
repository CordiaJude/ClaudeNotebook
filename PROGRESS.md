# PROGRESS

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
