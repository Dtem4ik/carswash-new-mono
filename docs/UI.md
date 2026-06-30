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

### Theming — light & dark

Both modes are first-class. Theme is managed by **next-themes** with the `class`
strategy on `<html>`, defaulting to the OS preference (`system`) and persisted;
the root `<html>` carries `suppressHydrationWarning` so the pre-paint class swap
never flashes (no FOUC). The header carries a light / dark / system toggle.

EVERY color is a CSS variable defined for **both** `:root` (light) and `.dark` —
the canvas, ink, accent/primary, borders, popover/card surfaces, AND every status
tone (vivid `--status-*`/`--pay-*` plus the `--tone-*-bg`/`--tone-*-fg` pill
pairs). Dark values are tuned so the pill tints and tone inks stay **AA-legible on
dark surfaces**, not only on light. Never hard-code a color (`#hex`, `rgb()`, or a
raw Tailwind palette class like `zinc-*`/`emerald-*`) in a component — reference a
token (`bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`,
`border`, `bg-status-*`, `text-tone-*-fg`, …). A theme switch must change nothing
but the tokens.

### Components — prefer shadcn

Build from **shadcn/ui primitives** wherever one exists (Button, Select, Badge,
Card, Input, Dialog, DropdownMenu, …); install via the shadcn CLI and theme them
with our tokens — never ship the stock defaults, never hand-roll a native control
that a primitive already covers. Bespoke **layout** (e.g. the bay-card
composition) may stay custom, but only assembled from themed tokens and shadcn
primitives.

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

- Breakpoints `sm`/`md`/`lg`/`xl`. CSS Grid over flex-math. Full-height =
  `min-h-[100dvh]`, never `h-screen`.
- The authenticated shell is **full-bleed**: a fixed-width left rail flush to the
  edge and full height, with the main area filling the remaining width. Do NOT
  wrap the shell or board in a `max-w-*` centering container (it detaches the
  content from the rail on wide screens). A reading-width cap may be applied only
  to narrow text-form views if needed — never to the dashboard frame.
- **App shell:** a **collapsible (icon) sidebar** built on shadcn's `Sidebar`
  (`collapsible="icon"`) + a clean header carrying the sidebar trigger, the brand
  mark, the org, the car-wash switcher, the language switcher, the theme toggle,
  and the signed-in user with logout.
  - Expanded, the sidebar shows icon + label (and a "soon" badge for disabled
    items); collapsed, it shows icon-only and surfaces each label as a **tooltip**
    (the badge hides). The active route uses the sidebar's `isActive` state and
    carries the accent.
  - The open/collapsed state is **persisted** via shadcn's `sidebar_state` cookie,
    read as `defaultOpen` in the `(app)` layout so there is **no flash** on
    reload, and toggled from the header trigger or `⌘/Ctrl+B`.
  - On mobile the sidebar is a **sheet** (via the `use-mobile` hook) that opens
    from the trigger and closes on navigation or overlay tap. No bespoke drawer.
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

## Error UX — failed actions

A read that fails shows its **inline** error state (above). An **action** that
fails — a create/close/cancel/payment, a shift open/close, a cash movement, an
admin write — must always surface a clear, **localized** reason. A failure is
**never** console-only and never a silent no-op.

- **Blocking modal is the default.** Any mutation rejection rolls back its
  optimistic cache change and opens the app-wide error modal
  (`src/components/ui/error-dialog.tsx`, mounted once in `Providers`, fed by the
  `action-error` store). This is wired centrally in the TanStack **mutation
  cache** (`src/lib/query-client.ts`), so even an action whose originating screen
  has navigated away (intake → board) still reports.
- **Localized codes.** The modal maps the backend's stable `{ "code": … }` via
  the `errors` message namespace (`src/lib/errors.ts`). An **unknown** code falls
  back to a generic localized message plus the raw code shown for support.
- **Offer the next step.** Where a failure has an obvious recovery, the modal
  shows an action button — e.g. `shift.not_open` → **Open a shift** (→ `/shift`).
  Capability/forbidden errors explain; validation errors point to the field.
- **Inline opt-out for forms.** A form dialog that already shows the error next
  to its fields (create/edit entity, record payment, add member, price cell)
  opts out of the modal with `meta: { errorMode: "inline" }` on its mutation and
  renders the same localized message inline.
- **Toasts are for minor, transient info only** — never the sole signal that an
  action failed.

## Money / time / i18n

- **Money:** Geist Mono, `Intl.NumberFormat` with the **active car wash's**
  currency; minor-unit scale derived from the currency. **Time:**
  `Intl.DateTimeFormat` with the car wash's **IANA timezone**. Helpers in
  `src/lib/format.ts`; values stay canonical until the edge.
- **All text via `next-intl`** — zero hard-coded strings; catalogs in
  `apps/web/messages/{en,ru,kk}.json` stay at full parity.

## License plate

Vehicle plates render through the country-aware `LicensePlate` component
(`src/components/license-plate.tsx`), never as plain text. It draws a realistic
plate face — a **fixed** light plate palette (the `--plate-*` tokens, defined
once in `:root` and **not** overridden in `.dark`) so dark ink stays legible in
both themes — using monospace bold uppercase figures. Props: `plate` (raw
string), `country` (ISO 3166-1 alpha-2, from the **active car wash**), `size`
(`sm` for list/board chips, `md` for detail/intake). The accessible name
(`aria-label`) is always the raw plate string. Country/region is **never** baked
into the app — it is a car-wash attribute (`car_washes.country`).

A registry (`PLATE_FORMATS`, keyed by country code) maps a country to a
`PlateFormat` — an inline-SVG flag, a `match(plate)` test, and a `render(plate)`
splitter. Kazakhstan (`KZ`) is implemented: a flag + `KZ` band, the registration
body (`777 ABC`), and the 2-digit region (`02`). If the car wash's country has no
registered format, or the plate doesn't match it, the component falls back to a
clean unsegmented generic plate.

### Adding a license plate country

1. Implement a `PlateFormat` in `license-plate.tsx`: an inline-SVG `Flag`
   (national colors are allowed inside the SVG — they're the flag's identity, not
   theme chrome), a `match(plate)` regex over the normalized (spaceless, upper)
   plate, and a `render(plate)` that returns `PlateSegments`. Add a render branch
   if the layout differs from the existing `kz` / `plain` shapes.
2. Register it in `PLATE_FORMATS` under its ISO 3166-1 alpha-2 code.
3. Set `car_washes.country` for washes in that country (it flows to the web via
   `/me` → the active car wash). No call sites change — they already pass the
   active car wash's `country`.
4. Add parse + fallback cases to `license-plate.test.ts`.

`RU` and `IL` have documented stubs in the registry comment and currently route
to the generic fallback; enabling them is exactly the steps above.
