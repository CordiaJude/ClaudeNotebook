# PROGRESS

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
