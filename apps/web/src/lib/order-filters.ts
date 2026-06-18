import type { OrderListQuery } from "@/hooks/use-orders";

/**
 * Pure helpers for the order list filters. Date-range inputs are entered as
 * calendar days (YYYY-MM-DD) and must be interpreted in the **car wash's**
 * timezone, then converted to the canonical UTC instants the API filters on
 * (`created_from` inclusive, `created_to` exclusive). Kept framework-free so the
 * timezone math is unit-tested directly.
 */

export type StatusFilter = "" | "queued" | "in_progress" | "done" | "cancelled";

export interface OrderFilters {
  status: StatusFilter;
  boxId: string;
  from: string;
  to: string;
  page: number;
  pageSize: number;
}

/** Offset (ms) of `timeZone` from UTC at the given instant. */
function tzOffsetMs(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, number> = {};
  for (const { type, value } of dtf.formatToParts(date)) {
    if (type !== "literal") parts[type] = Number(value);
  }
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
}

/**
 * The UTC instant of local midnight (00:00) on `dateStr` in `timeZone`, as an
 * ISO string. Resolves the offset twice so it stays correct across a DST jump.
 */
export function zonedDayStartUtc(dateStr: string, timeZone: string): string {
  const wallAsUtc = Date.parse(`${dateStr}T00:00:00Z`);
  let offset = tzOffsetMs(timeZone, new Date(wallAsUtc));
  offset = tzOffsetMs(timeZone, new Date(wallAsUtc - offset));
  return new Date(wallAsUtc - offset).toISOString();
}

/** The calendar day after `dateStr` (YYYY-MM-DD), in UTC date arithmetic. */
export function nextCalendarDay(dateStr: string): string {
  const next = new Date(`${dateStr}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/** Build the typed list query from UI filters, scoped to the wash timezone. */
export function buildOrderListParams(
  filters: OrderFilters,
  timeZone: string,
): OrderListQuery {
  const query: OrderListQuery = {
    limit: filters.pageSize,
    offset: filters.page * filters.pageSize,
  };
  if (filters.status) query.status = filters.status;
  if (filters.boxId) query.box_id = filters.boxId;
  if (filters.from)
    query.created_from = zonedDayStartUtc(filters.from, timeZone);
  if (filters.to) {
    query.created_to = zonedDayStartUtc(nextCalendarDay(filters.to), timeZone);
  }
  return query;
}
