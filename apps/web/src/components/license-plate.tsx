import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Country-aware license plate.
 *
 * A small registry maps an ISO 3166-1 alpha-2 country code to a {@link PlateFormat}
 * (a flag, a `match` test, and a `render` splitter). The active car wash's country
 * selects the formatter; if no country is registered, or the plate does not match
 * that country's standard layout, we fall back to a clean generic plate chrome.
 *
 * Adding a country is one registry entry — see `docs/UI.md` ("Adding a license
 * plate country"). `RU` and `IL` stubs below mark the seam.
 */

// --- segments -----------------------------------------------------------------

/** A plate split into its display parts, per the country's standard. */
export type PlateSegments =
  /** Unstructured: rendered as a single block (generic chrome). */
  | { kind: "plain"; text: string }
  /** Kazakhstan: registration body (`777 ABC`) + a 2-digit region (`02`). */
  | { kind: "kz"; body: string; region: string };

// --- formatters ---------------------------------------------------------------

export interface PlateFormat {
  /** ISO 3166-1 alpha-2 code this formatter serves. */
  readonly country: string;
  /** Two-letter country mark shown in the plate's left band (e.g. "KZ"). */
  readonly mark: string;
  /** Inline, theme-fixed national flag sized for the plate band. */
  readonly Flag: (props: { size: number }) => ReactNode;
  /** Does the (normalized) plate follow this country's standard layout? */
  match(plate: string): boolean;
  /** Split a matching plate into its display segments. */
  render(plate: string): PlateSegments;
}

/** Strip spaces and uppercase — plates are compared case- and space-insensitively. */
export function normalizePlate(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/**
 * Kazakhstan civic plate: 3 digits, 2–3 letters, then a 2-digit region code,
 * e.g. `777 ABC 02`. Matched on the normalized (spaceless, upper) form.
 */
export const KZ_PLATE_PATTERN = /^(\d{3})([A-Z]{2,3})(\d{2})$/;

/** Inline Kazakhstan flag — turquoise field, golden sun + steppe eagle, left
 * ornament. Official flag colors (not theme tokens — these are the flag's
 * identity, like a logo) so it reads correctly on the light plate band. */
function KazakhstanFlag({ size }: { size: number }) {
  const turquoise = "#00AFCA";
  const gold = "#FEC50C";
  return (
    <svg
      width={size}
      height={size / 2}
      viewBox="0 0 40 20"
      role="presentation"
      aria-hidden="true"
      className="block shrink-0 rounded-[1px]"
    >
      <rect width="40" height="20" fill={turquoise} />
      {/* sun + rays */}
      <g fill={gold}>
        <circle cx="20" cy="9" r="3" />
        {Array.from({ length: 16 }).map((_, i) => {
          const angle = (i * Math.PI) / 8;
          const x1 = 20 + Math.cos(angle) * 3.8;
          const y1 = 9 + Math.sin(angle) * 3.8;
          const x2 = 20 + Math.cos(angle) * 5;
          const y2 = 9 + Math.sin(angle) * 5;
          return (
            <line
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed ray count
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={gold}
              strokeWidth="0.7"
            />
          );
        })}
        {/* stylized soaring eagle below the sun */}
        <path d="M13 14 Q20 11 27 14 Q20 13.2 13 14 Z" />
      </g>
      {/* left vertical ornament band */}
      <g fill={gold} opacity="0.95">
        <rect x="2" y="3" width="1.4" height="14" rx="0.5" />
      </g>
    </svg>
  );
}

const KAZAKHSTAN: PlateFormat = {
  country: "KZ",
  mark: "KZ",
  Flag: KazakhstanFlag,
  match: (plate) => KZ_PLATE_PATTERN.test(plate),
  render: (plate) => {
    const m = KZ_PLATE_PATTERN.exec(plate);
    if (!m) return { kind: "plain", text: plate };
    return { kind: "kz", body: `${m[1]} ${m[2]}`, region: m[3] };
  },
};

/**
 * Registry of country formatters, keyed by ISO 3166-1 alpha-2 code.
 *
 * To add a country: implement a {@link PlateFormat} (a `Flag`, a `match` regex,
 * and a `render` splitter) and add it here. `match` returning `false` (or no
 * registry entry) routes the plate to the generic chrome automatically.
 *
 * RU and IL are intentionally NOT registered yet, so they currently fall back to
 * generic. To enable them, register entries like:
 *   - RU: civic plate `А123ВС 77` (Cyrillic letter · 3 digits · 2 letters ·
 *     2–3 digit region). Add a Russian tricolor `Flag`, a `match` over the
 *     Cyrillic letter subset (А,В,Е,К,М,Н,О,Р,С,Т,У,Х), and a `render` that
 *     splits letters/digits from the region.
 *   - IL: civic plate `12-345-67` or `123-45-678` (digits only, hyphen groups).
 *     Add an Israeli flag `Flag`, a `match` over the digit-group forms, and a
 *     `render` that regroups the digits with the standard separators.
 */
export const PLATE_FORMATS: Record<string, PlateFormat> = {
  KZ: KAZAKHSTAN,
};

/** Resolve the segments + matched formatter for a plate under a given country. */
export function resolvePlate(
  raw: string,
  country: string | null | undefined,
): { format: PlateFormat | null; segments: PlateSegments } {
  const normalized = normalizePlate(raw);
  const format = country
    ? (PLATE_FORMATS[country.toUpperCase()] ?? null)
    : null;
  if (format?.match(normalized)) {
    return { format, segments: format.render(normalized) };
  }
  // No registered country, or the plate doesn't fit it → generic chrome.
  return { format: null, segments: { kind: "plain", text: normalized } };
}

// --- component ----------------------------------------------------------------

type Size = "sm" | "md";

interface SizeConfig {
  height: string;
  text: string;
  bandText: string;
  regionText: string;
  padX: string;
  flag: number;
  frame: string;
  inner: string;
}

const SIZES: Record<Size, SizeConfig> = {
  sm: {
    height: "h-6",
    text: "text-[12px]",
    bandText: "text-[8px]",
    regionText: "text-[11px]",
    padX: "px-2",
    flag: 13,
    frame: "rounded-[6px] p-[1.5px]",
    inner: "rounded-[5px]",
  },
  md: {
    height: "h-9",
    text: "text-base",
    bandText: "text-[10px]",
    regionText: "text-sm",
    padX: "px-3",
    flag: 18,
    frame: "rounded-[9px] p-0.5",
    inner: "rounded-[7px]",
  },
};

interface LicensePlateProps {
  /** Raw plate string as stored (any case / spacing). */
  plate: string;
  /** ISO 3166-1 alpha-2 country of the active car wash; selects the formatter. */
  country?: string | null;
  /** `sm` for list/board chips, `md` for detail/intake. */
  size?: Size;
  className?: string;
}

/**
 * A realistic, themed plate face. KZ-format plates render with the flag + region
 * split; anything else (or an unregistered country) renders in clean generic
 * chrome. The accessible name is always the raw plate string.
 */
export function LicensePlate({
  plate,
  country,
  size = "sm",
  className,
}: LicensePlateProps) {
  const s = SIZES[size];
  const { format, segments } = resolvePlate(plate, country);

  return (
    <span
      role="img"
      aria-label={plate}
      className={cn(
        "bg-plate-border inline-flex shrink-0 select-none align-middle shadow-sm",
        s.frame,
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "from-plate-face to-plate-face-edge text-plate-ink inline-flex items-stretch overflow-hidden bg-gradient-to-b font-mono font-bold uppercase tracking-wide",
          s.height,
          s.inner,
        )}
      >
        {segments.kind === "kz" ? (
          <>
            {/* Left band: flag + country mark */}
            {format ? (
              <span
                className={cn(
                  "flex flex-col items-center justify-center gap-px",
                  size === "sm" ? "px-1" : "px-1.5",
                )}
              >
                <format.Flag size={s.flag} />
                <span
                  className={cn("text-plate-muted leading-none", s.bandText)}
                >
                  {format.mark}
                </span>
              </span>
            ) : null}
            {/* Center: registration body */}
            <span
              className={cn(
                "border-plate-divider flex items-center border-l",
                s.padX,
                s.text,
              )}
            >
              {segments.body}
            </span>
            {/* Right: region code */}
            <span
              className={cn(
                "border-plate-divider text-plate-muted flex items-center border-l",
                size === "sm" ? "px-1.5" : "px-2",
                s.regionText,
              )}
            >
              {segments.region}
            </span>
          </>
        ) : (
          // Generic chrome: clean, unsegmented monospace plate.
          <span className={cn("flex items-center", s.padX, s.text)}>
            {segments.text}
          </span>
        )}
      </span>
    </span>
  );
}
