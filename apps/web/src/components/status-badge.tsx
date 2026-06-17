import { type StatusTone, TONE_DOT_CLASS, TONE_PILL_CLASS } from "@/lib/status";
import { cn } from "@/lib/utils";

/**
 * Status indicator: a tinted pill carrying a vivid dot plus a localized label.
 * The label is always rendered, so status is never communicated by color alone
 * (docs/UI.md a11y). The tint + ink come from the tone tokens, tuned for AA.
 */
export function StatusBadge({
  tone,
  label,
  className,
}: {
  tone: StatusTone;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        TONE_PILL_CLASS[tone],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT_CLASS[tone])}
      />
      {label}
    </span>
  );
}
