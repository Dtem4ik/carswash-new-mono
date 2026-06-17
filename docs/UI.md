# UI & UX Standard — CarsWash operator dashboard

Direction: clean modern (Linear/Vercel) operational dashboard on shadcn/ui + Tailwind v4.
Every screen across all phases follows this. Audience: operators on tablets, managers/owners on desktop, occasional phone.

## Design dials (operational tool — NOT a marketing site)
- Visual variance: LOW — predictable, symmetric CSS-grid layouts. No artsy asymmetry.
- Motion: MINIMAL — functional transitions only (150–200ms, transform/opacity). NO perpetual/looping
  animations, NO magnetic buttons, NO GSAP/Three/Framer choreography. The desk tool must be calm and fast, not "alive".
- Density: MEDIUM — the board shows multiple boxes + queues clearly; manager views are data-forward but breathable.

## Tokens
- Fonts: Geist (UI) + Geist Mono for ALL numbers (money, counts, order numbers, times). No Inter, no serif.
- Color: neutral base = Zinc (bg zinc-50 / dark zinc-950; never #000). ONE accent (Emerald or electric blue,
  saturation <80%), used sparingly for primary actions. No purple/neon/glow gradients.
- Status semantics: free=zinc · in_progress=accent · queued=amber · done=emerald · cancelled=muted;
  payment: unpaid=amber · paid=emerald · credit=muted-violet · refunded=rose.
  Status = colored dot + label, NEVER color alone (a11y).
- Radius: rounded-xl cards, rounded-md controls (customize shadcn defaults — never ship generic).
- Shadows: subtle, tinted to bg. Cards only when elevation communicates hierarchy; else group via border/divide + space.
- Spacing: 4px scale; card padding p-5/p-6; gap-4/gap-6 grids.

## Layout & responsive
- Breakpoints sm/md/lg/xl; container max-w-[1400px] mx-auto. CSS Grid over flex-math.
- Board grid: grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4.
- Full-height = min-h-[100dvh], never h-screen. Mobile collapses to single column, px-4.
- App shell: left nav (collapses to drawer/top bar on small screens) + header (org + car-wash switcher, language, user/logout).

## Touch & accessibility
- Min tap target 44x44 for primary controls. Keyboard-navigable; visible focus rings.
- Inputs: label above, error below, gap-2. Contrast AA. Status never by color alone.
- Icons: @phosphor-icons/react or @radix-ui/react-icons, consistent strokeWidth. NO emojis.

## Mandatory states for every data view
- Loading: skeletons matching layout (not spinners). Empty: composed, tells how to populate.
- Error: inline, using the localized error-code map. Tactile: :active scale-[0.98].

## Money / time / i18n
- Money: Geist Mono, Intl with the active car wash's currency. Time: Intl with the car wash's IANA timezone.
- All text via next-intl; zero hard-coded strings.
