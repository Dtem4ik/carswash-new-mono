"use client";

import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Shift } from "@/hooks/use-board-data";
import { useFormatters } from "@/lib/format";

interface Props {
  shift: Shift | null | undefined;
  shiftPending: boolean;
  busy: number;
  total: number;
  queued: number;
  timeZone: string;
}

/**
 * A calm context strip above the bay grid. Every figure is derived from data
 * already on the board — the open shift (open/closed + opened time), bays
 * busy/total, and the total cars in queue. No revenue or invented numbers.
 */
export function BoardContextStrip({
  shift,
  shiftPending,
  busy,
  total,
  queued,
  timeZone,
}: Props) {
  const tBoard = useTranslations("board");
  const fmt = useFormatters();
  const shiftOpen = shift != null;

  return (
    <section
      aria-label={tBoard("contextLabel")}
      className="bg-card flex flex-col gap-4 rounded-2xl border p-4 shadow-sm sm:flex-row sm:items-center sm:gap-8 sm:px-6"
    >
      <Stat label={tBoard("shiftLabel")}>
        {shiftPending ? (
          <Skeleton className="h-5 w-28" />
        ) : (
          <div className="flex items-center gap-2">
            <StatusBadge
              tone={shiftOpen ? "free" : "done"}
              label={shiftOpen ? tBoard("shiftOpen") : tBoard("shiftClosed")}
            />
            {shiftOpen ? (
              <span className="text-muted-foreground font-mono text-xs">
                {tBoard("shiftSince", {
                  time: fmt.time(shift.opened_at, timeZone),
                })}
              </span>
            ) : null}
          </div>
        )}
      </Stat>

      <Divider />

      <Stat label={tBoard("baysLabel")}>
        <span className="font-mono text-lg font-semibold tracking-tight">
          {tBoard("baysValue", { busy, total })}
        </span>
      </Stat>

      <Divider />

      <Stat label={tBoard("queueLabel")}>
        <span className="font-mono text-lg font-semibold tracking-tight">
          {queued}
        </span>
      </Stat>
    </section>
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {label}
      </span>
      <div className="flex min-h-7 items-center">{children}</div>
    </div>
  );
}

function Divider() {
  return (
    <span aria-hidden="true" className="bg-border hidden h-9 w-px sm:block" />
  );
}
