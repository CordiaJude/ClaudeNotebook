# Draftly design system: components

Step 2 of the Replica pack (`/replica-design`). Every component in the recon list, plus the states the recon did not see but the product needs (focus, disabled, loading, error, empty).

- Tokens: `replica/design/tokens.json` (source). `pnpm tokens` generates `styles/tokens.css` (CSS variables + the Tailwind v4 theme) and `lib/tokens.generated.ts`.
- Styles: `styles/components.css`, `styles/editor.css`. Tokens only; a test fails on any raw colour.
- Code: `components/ui/*` (base), `components/doc/parts.tsx` (product components).
- Living page: `/design`, both themes side by side.

## How it was made

There were no screenshots in `replica/screens/`, so nothing was measured from the original. The system is designed from the brief in `PROMPT.md` and the component list in `recon.md`: warm neutral backgrounds, one muted accent, a serif for headings, a clean sans for UI, quiet chrome, generous space, the document as the hero.

| decision | value | why |
| --- | --- | --- |
| Neutrals | warm stone, 5 surface steps (`bg`, `surface`, `raised`, `sunken`, `pressed`) and 4 text steps | the page sits on a slightly darker canvas, so the document is the brightest thing on screen |
| Accent | muted petrol teal (`#2a5f6a` light, `#8cc3cd` dark) | one accent only. It marks primary actions, links and everything the AI does. A placeholder until `/replica-brand` |
| Comments | warm amber `highlight` | comments must not be confused with the AI, so they do not use the accent |
| Headings | Newsreader, weight 450 to 600 | open serif with optical sizes; reads as editorial at 40px and stays clear at 18px |
| UI and body | Inter | neutral, clear at 13px, wide language coverage |
| Code | JetBrains Mono | open, already in the repo |
| Buttons | rounded rectangle, 10px radius, accent fill | quiet; no pill shapes |
| Radius | 4, 6, 10, 14, 20, pill | controls 6 to 10, cards 14, dialogs 20 |
| Spacing | 4px base: 0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96 | |
| Type scale | 12, 13, 14, 16, 18, 22, 28, 40, 56 | body 16/26 for long reading |
| Motion | 120, 180, 280 ms, one ease-out curve | all motion stops under `prefers-reduced-motion` |
| Layout | header 52, doc text 680, page 856, chat 380, tabs 232, slide rail 176, content max 1120 | breakpoints 640, 768, 1024, 1280 |
| Icons | Lucide (ISC licence) | open set, one size (16) and stroke (1.75) |

Fonts are from Google Fonts under the SIL Open Font License, self-hosted through `@fontsource-variable`, so no request goes to Google at runtime.

Nothing here comes from another product: no logo, palette, typeface, icon or copy. A test fails if another company's name appears in the design files.

## Contrast

`python3 contrast.py replica/design/tokens.json`: **118 pairs, 0 failing AA**, light and dark. The full report is in `replica/design/contrast-report.txt`. The same check runs in `pnpm test`. Tightest pairs: input borders at 3.18:1 (needs 3), meta text on hover fills at 4.77:1 (needs 4.5).

Axe on `/design`: 0 serious or critical issues in both themes.

## Rules for every component

- Focus: a 2px `focus` ring, offset 2px, on `:focus-visible` only. Never removed.
- Hit area: 30px minimum, 36px default, 44px for the large size.
- Disabled: 50% opacity, `not-allowed` cursor, the real `disabled` attribute.
- Loading: spinner plus the label kept, `aria-busy`, clicks ignored, focus kept.
- Colour is never the only signal: errors have text, states have an icon or a label.
- Roles change values, never names: use `var(--color-surface)` or `bg-surface`, never a hex.

## Base components

```
Button
  variants  primary, secondary, ghost, danger, icon
  sizes     sm 30px, md 36px, lg 44px; icon 32px square
  states    default, hover, active/pressed, focus-visible, disabled, loading
  tokens    primary: bg accent, text on-accent, hover accent-hover; secondary: bg raised, border border-input;
            ghost: transparent, hover sunken; danger: bg danger, text on-danger; radius md (sm: radius sm); font ui/500
  a11y      real <button>, type="button" unless submitting; icon-only needs aria-label; loading sets aria-busy and keeps the label
  used on   all

Input, Textarea, Select
  variants  input, textarea, select (Radix)
  states    default, focus-visible, error (aria-invalid + message), disabled, placeholder
  tokens    bg raised, border border-input (3:1), text text, placeholder text-subtle, error border danger, radius md, min height 36
  a11y      always a label (visible or aria-label); error text linked with aria-describedby; select is keyboard operable
  used on   S01, S04, S09, S11, S14

Modal
  variants  with trigger, controlled
  states    closed, open
  tokens    bg raised, border border, radius xl, shadow lg, scrim overlay; width min(480px, viewport - 32px)
  a11y      Radix Dialog: focus trapped, Esc closes, focus returns to the trigger, title and description announced
  used on   S03, S09, delete confirmation

Menu, Popover, Tooltip
  states    closed, open, item highlighted, item disabled
  tokens    bg raised, border border, radius lg, shadow lg; item hover sunken; tooltip bg text, text bg
  a11y      Radix: arrow keys, type-ahead, Esc; a tooltip never holds the only copy of information
  used on   all

Toast
  variants  neutral, error
  states    shown for 4s, dismissed
  tokens    bg raised, border border (error: danger), radius lg, shadow lg
  a11y      announced politely; never the only place an error appears
  used on   save, share, export

Avatar
  variants  person (6 colours), AI, stack
  states    default
  tokens    bg person-1..6, text on-person; AI: bg accent, text on-accent; 28px, ring surface
  a11y      role="img" with the name
  used on   S04, S06, S09, S13

Badge, Kbd, Switch, Segmented, Skeleton
  tokens    badge: sunken / accent-subtle / success-subtle / danger-subtle, radius pill; switch on: accent;
            segmented: sunken track, raised selected item; skeleton: sunken, pulse
  a11y      switch has a label; segmented is a single-choice toggle group; skeleton is aria-hidden
  used on   all

Empty state
  variants  first use (with action), no results (no action)
  tokens    dashed border border-input, radius lg, icon in a sunken circle, title text, body text-muted
  a11y      plain text, the action is a real button
  used on   S02, S05, S06

Banner
  variants  neutral (read-only), warning (reconnecting), error (with retry)
  tokens    sunken / warning-subtle / danger-subtle, radius md
  a11y      role="status", error is role="alert"
  used on   S04, S05, S07, S12
```

## Product components

```
Prompt box
  variants  chat; hero with Output picker (Doc / Slides)
  states    empty (send disabled), typing, sending (spinner, field locked), running (Stop replaces Send), disabled (viewer: "You can view this, not edit it")
  tokens    bg raised, border border-input, radius lg; hero adds shadow md and base-size text; focus ring on the whole box
  a11y      textarea labelled "Message"; Enter sends, Shift+Enter is a new line, ignored during IME composition; Output is a labelled toggle group
  used on   S02, S04

Chat message
  variants  user, AI, AI-with-questions, AI-progress, error
  states    streaming (caret, aria-busy), done (optional "Undo this change"), error (with "Try again")
  tokens    user: bg sunken, radius lg; AI: no bubble, plain text; progress: text-muted with a pulsing accent dot, then a check;
            error: danger-subtle + danger
  a11y      the list is role="log" and polite; each message starts with a hidden "You:" or "AI:"; errors are role="alert"
  used on   S04

Questions card (inside AI-with-questions)
  states    unanswered, option picked, free text, submitted (locked), skipped
  tokens    bg raised, border border, radius lg; option pill: border border-input, picked: accent-subtle + accent border
  a11y      one fieldset and legend per question; options are a radiogroup; "Skip, just draft" is always offered
  used on   S04 (F01)

Rich-text toolbar
  variants  full (top of the doc), floating selection menu
  states    default, active mark (aria-pressed), disabled (read-only)
  tokens    bg raised, border border, radius md, shadow md (floating only); pressed: pressed
  a11y      role="toolbar"; every icon button has a label; the selection menu leads with "Edit with AI" for editors and shows only Comment for commenters
  used on   S05

Edit with AI (the box under a selection)
  states    empty, typing, rewriting (loading), error (reason shown), cancelled
  tokens    bg raised, border accent, radius lg, shadow lg; quote: 2px accent rule
  a11y      labelled form; always states "Only the selected text changes"; error is role="alert"; Esc cancels
  used on   S05 (F02)

Tab bar
  variants  doc tabs: one, many, nested
  states    default, hover (handle appears), current (aria-current), renaming (inline input), dragging
  tokens    current: pressed; hover: sunken; radius sm
  a11y      role="tree"; reorder also by menu (Move up / Move down), never drag only
  used on   S05

Table block
  variants  table
  states    editing (cell colour, add and delete rows and columns), read-only
  tokens    border border, header bg sunken; cell fills tint-gray, red, orange, yellow, green, blue, purple
  a11y      real <table> with header cells; cell colour buttons are named and report aria-pressed
  used on   S05, S07

Chart block
  variants  bar, line (frame only for now)
  states    editing, read-only
  tokens    frame: bg raised, border border, radius md; title label; caption text-muted
  a11y      role="img" named by a title that states the finding
  note      the chart drawing and its colour palette are specified when the "Charts" feature is built; only the frame is built here
  used on   S05, S07

Comment badge and composer
  variants  inline badge, image pin, side list (cards), composer
  states    open (amber), sent to AI (accent, sparkle), resolved (grey); card: default, active, with replies; composer: empty, typing, near the 1000 limit, cannot ask AI (commenter)
  tokens    badge: highlight + warning border; sent: accent-subtle + accent; commented text: highlight; active text: 2px warning underline
  a11y      the badge is a button named with the count and state; composer has maxlength 1000 and a live "N left"
  used on   S05, S06, S07

Drafting placeholder and AI presence
  states    waiting (skeleton + what the section will say), replaced by the section
  tokens    dashed border border-input, radius md; presence pill: accent-subtle + accent-text; AI-edited text: accent-subtle
  a11y      role="status"; the presence pill is polite, not assertive
  used on   S04, S05, S07

Slide thumbnail rail
  variants  vertical list
  states    default, selected (accent outline, aria-current), dragging (lifted, tilted), adding (dashed tile)
  tokens    rail bg bg; frame bg raised, border border, radius sm; 176px wide, 16:9 frames
  a11y      ordered list of named buttons ("Slide 2: Where we are"); reorder also by keyboard
  used on   S07

Slide canvas element
  variants  text, image, shape, chart
  states    default, hover (outline), selected (accent outline + 4 handles + type tag), moving (lifted), resizing, locked (dashed, not movable)
  tokens    outline and handles accent; tag bg accent, text on-accent; locked border border-input
  a11y      each element is focusable; text elements are named by their text, others by a label; arrow keys move, Shift+arrows resize; locked sets aria-disabled
  used on   S07

Speaker notes
  tokens    bg surface, border border, text text-muted, label eyebrow
  used on   S07, S08

Colour picker
  variants  brand-locked (only the design system's colours), free (adds a hex field)
  states    default, selected (focus ring)
  tokens    28px swatches, border border-input; the colours themselves are data from the design system
  a11y      radiogroup; every swatch has a name; locked mode says why in text
  used on   S07, S11

Share dialog
  variants  invite (email + role), link
  states    private ("Only you can open this"), shared (list with roles, "Invited" for no account yet), blocked (error text), sending
  tokens    rows 14px; link box bg sunken, radius md; roles are selects
  a11y      email input typed as email; each role select is named for its person; the link sentence says exactly who can open it
  used on   S09

Export menu
  variants  doc formats (Word, PDF, Markdown), deck formats (PowerPoint, PDF, web page, slide PNG)
  states    idle, working (spinner, other items disabled), done (check), error (danger text, "Try again")
  tokens    menu surface as Menu; status text text-subtle
  a11y      role="menu"; the status is announced; an item in progress sets aria-busy
  used on   S10

Library card
  variants  doc, deck
  states    default, hover (border + shadow), focus-visible, shared badge
  tokens    bg raised, border border, radius lg; thumbnail surface (doc) or sunken (deck)
  a11y      the whole card is one link named by the title, kind, time and who shared it
  used on   S02

Template card
  variants  doc, deck
  states    default, hover, focus-visible
  tokens    bg raised, border border, radius lg
  a11y      a real button named by the template
  used on   S03

Change attribution list
  variants  person, AI (with who asked)
  tokens    rows as Menu items; AI avatar accent
  a11y      a list; "AI for Priya" is text, not colour alone
  used on   S13
```

## Not built in this step

- The chart drawing and chart colours (frame only; see Chart block).
- Present mode chrome (S08) and the design system editor (S11): they are screens made of these parts, built in `/replica-build`.
- The real logo. The page glyph and the name "Draftly" are placeholders until `/replica-brand`.
- Old wording still in app screens outside the design system ("Ask Claude" in the editor panel and notebooks list). That is the first task of `/replica-build` (milestone M0).
