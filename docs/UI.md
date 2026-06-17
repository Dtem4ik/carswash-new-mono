# UI & UX Standard — CarsWash operator dashboard

Binding design system for every screen across all phases. This is the source of
truth; when a screen and this document disagree, the document wins.

## Concept — "calm operational clarity"

A considered working tool **with identity**. Two readings must both succeed:

- An operator at a wash reads the state of every bay in **half a second** —
  status is the hero, figures are legible, nothing competes for attention.
- An owner **enjoys opening it** — it feels crafted: deep ink, a confident
  accent, surfaces that lift off the canvas, motion that is quiet and precise.

This is neither marketing gloss nor empty minimalism. It is dense-but-calm: rich
information, low visual noise, one disciplined accent, and depth used to express
hierarchy — not decoration.

Audience: operators on tablets, managers/owners on desktop, occasional phone.

## Design dials

- **Visual variance: LOW** — predictable, symmetric CSS-grid layouts. No artsy
  asymmetry, no off-grid hero shots.
- **Density: MEDIUM** — rich but breathable. The board shows several bays with
  their queues at a glance; manager views are data-forward but never cramped.
- **Motion: MINIMAL & functional** — 150–200ms `transform`/`opacity`/`shadow`
  transitions only (status change, hover lift, focus). **NO** perpetual or
  looping animation, magnetic buttons, parallax, or scroll choreography. State
  that ticks (e.g. elapsed time) updates data, it does not animate.

## Color

Tokens live in `apps/web/src/app/globals.css` (`@theme inline` + `:root`/`.dark`)
as **oklch**. Never hard-code a hex/rgb in a component — reference a token.

- **Canvas:** a cool near-white with a faint cool (blue) tint. Surfaces
  (`--card`, near pure white) **lift above** the canvas; depth comes from this
  contrast plus shadow, not from heavy borders.
- **Ink:** deep cool slate (~slate-900), **never pure black**.
- **Accent:** ONE refined, confident modern blue (`--primary`), tuned for AA
  contrast — not the literal Bootstrap blue, not neon. Used for primary actions,
  the active nav, the brand mark, and the focal figure (order total). Used
  sparingly; it should still feel special on a busy board.

### Status scale (disciplined — each its own tone)

Operational and payment status each map to a calm, distinct tone. Status is
**always color + label** (and, in a badge, a dot) — **never color alone** (a11y).

| Operational  | Tone               | Payment   | Tone              |
| ------------ | ------------------ | --------- | ----------------- |
| free         | calm green         | unpaid    | amber             |
| in_progress  | accent blue        | paid      | green             |
| queued       | amber              | credit    | violet            |
| done         | muted teal / slate | refunded  | rose              |
| cancelled    | soft rose          |           |                   |

Each tone resolves to three roles:

- a **vivid** value (`--status-*` / `--pay-*`) for dots and the bay accent bar;
- a soft **tint** (`--tone-*-bg`) for pill backgrounds;
- a deep **ink** (`--tone-*-fg`) for pill text — chosen so label text meets AA on
  its tint.

Code → tone mapping is centralized in `src/lib/status.ts`; the badge renders a
tinted pill in `src/components/status-badge.tsx`. Components never invent colors.

## Depth & shape

- **Shadows:** soft and layered, tinted toward the ink hue (not flat black). At
  rest, subtle (`shadow-sm`). On hover, slightly larger (`shadow-md`) **and**
  `-translate-y-0.5` (2px lift). Use elevation to communicate hierarchy.
- **Radius:** `rounded-2xl` cards; `rounded-lg` controls; `rounded-full` pills
  and dots. These are customized tokens — never ship generic shadcn defaults.
- **Spacing:** 4px scale. Card padding `p-5`; grid gaps `gap-4`/`gap-6`.
- **Transitions:** 150–200ms on `box-shadow`/`transform`/`color`. Status changes
  cross-fade their tone; no flashing.

## Typography

- **Geist** for UI, **Geist Mono** for **all figures** — money, order numbers
  (№/#), counts, times, durations, plates. Every figure uses `tabular-nums`
  (wired globally on `.font-mono`).
- Hierarchy via **weight / size / color**, not many type families. One semibold
  focal figure per card (the order total, in the accent color); supporting
  figures are muted and smaller.

## Layout & responsive

- Breakpoints `sm`/`md`/`lg`/`xl`. Container `max-w-[1400px] mx-auto`. CSS Grid
  over flex-math. Full-height = `min-h-[100dvh]`, never `h-screen`.
- **App shell:** left nav (collapses to a drawer on small screens) + a clean
  header carrying the brand mark, the org, the car-wash switcher, the language
  switcher, and the signed-in user with logout. The active nav item carries the
  accent.
- **Board grid:** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`.
  Mobile collapses to a single column at `px-4`.

## Touch & accessibility

- Min tap target **44×44** for primary/interactive controls.
- Keyboard-navigable; **visible focus rings** (accent ring) on every control.
- Contrast **AA** for text and meaningful UI. Status never by color alone.
- Inputs: label above, error below, `gap-2`. Tactile: `:active` translate/scale.
- Icons: `lucide-react` (shadcn's native default) only — one icon library across
  the app, at a consistent size (18–20) and `strokeWidth` 2; emphasis comes from
  color, not weight. **No emojis.**

## Mandatory states for every data view

- **Loading:** skeletons that mirror the real layout (including the bay accent
  bar and context strip) — not spinners.
- **Empty:** composed and intentional — says how to populate, never reads as a
  blank hole.
- **Error:** inline, using the localized error-code map (`src/lib/errors.ts`),
  with a retry affordance.

A **free bay is not an empty state** — it is an inviting affordance (soft dashed
panel) with a capability-gated primary call to action.

## Money / time / i18n

- **Money:** Geist Mono, `Intl.NumberFormat` with the **active car wash's**
  currency; minor-unit scale derived from the currency. **Time:**
  `Intl.DateTimeFormat` with the car wash's **IANA timezone**. Helpers in
  `src/lib/format.ts`; values stay canonical until the edge.
- **All text via `next-intl`** — zero hard-coded strings; catalogs in
  `apps/web/messages/{en,ru,kk}.json` stay at full parity.
