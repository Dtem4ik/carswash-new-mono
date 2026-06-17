import { type StatusTone, TONE_DOT_CLASS } from "@/lib/status";
import { cn } from "@/lib/utils";

/**
 * Status indicator: a colored dot plus a localized label. The label is always
 * rendered, so status is never communicated by color alone (docs/UI.md a11y).
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
        "inline-flex items-center gap-1.5 text-sm font-medium",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-2 shrink-0 rounded-full", TONE_DOT_CLASS[tone])}
      />
      {label}
    </span>
  );
}
