"use client";

import { Clock, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Box, Order } from "@/hooks/use-board-data";
import { useFormatters } from "@/lib/format";
import {
  BOX_STATUS_TONE,
  ORDER_STATUS_TONE,
  PAYMENT_STATUS_TONE,
  TONE_BAR_CLASS,
} from "@/lib/status";
import { useTenant } from "@/lib/tenant-context";
import { cn } from "@/lib/utils";

interface Props {
  box: Box;
  activeOrder: Order | null;
  queue: Order[];
  currency: string;
  timeZone: string;
}

/**
 * A bay on the board: a status-keyed left accent bar, the box name + status pill
 * as the header, and either a rich busy state (car, total as the focal accent
 * figure, payment, elapsed) or an inviting free state with a gated CTA.
 */
export function BoxCard({
  box,
  activeOrder,
  queue,
  currency,
  timeZone,
}: Props) {
  const tBoard = useTranslations("board");
  const tBox = useTranslations("boxStatus");
  const tOrder = useTranslations("orderStatus");
  const tPay = useTranslations("paymentStatus");
  const fmt = useFormatters();
  const { hasCapability } = useTenant();

  const elapsedMinutes = useElapsed(activeOrder?.started_at ?? null);
  const elapsedLabel =
    elapsedMinutes == null
      ? null
      : elapsedMinutes >= 60
        ? tBoard("elapsedLong", {
            hours: Math.floor(elapsedMinutes / 60),
            minutes: elapsedMinutes % 60,
          })
        : tBoard("elapsedShort", { minutes: elapsedMinutes });

  return (
    <Card className="group relative gap-0 overflow-hidden p-5 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-0 w-1.5",
          TONE_BAR_CLASS[BOX_STATUS_TONE[box.status]],
        )}
      />

      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate font-semibold tracking-tight">{box.name}</h3>
        <StatusBadge
          tone={BOX_STATUS_TONE[box.status]}
          label={tBox(box.status)}
        />
      </div>

      {activeOrder ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-mono text-lg font-semibold tracking-tight">
                {activeOrder.plate ?? tBoard("plateUnknown")}
              </p>
              <p className="text-muted-foreground font-mono text-xs">
                {tBoard("orderNumber", { number: activeOrder.number })}
              </p>
            </div>
            <StatusBadge
              tone={ORDER_STATUS_TONE[activeOrder.status]}
              label={tOrder(activeOrder.status)}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-status-progress font-mono text-2xl font-semibold tracking-tight">
              {fmt.money(activeOrder.total_minor, currency)}
            </span>
            <StatusBadge
              tone={PAYMENT_STATUS_TONE[activeOrder.payment_status]}
              label={tPay(activeOrder.payment_status)}
            />
          </div>

          {activeOrder.started_at ? (
            <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <Clock size={14} aria-hidden="true" />
              <span className="font-mono">
                {fmt.time(activeOrder.started_at, timeZone)}
              </span>
              {elapsedLabel ? (
                <span className="font-mono">· {elapsedLabel}</span>
              ) : null}
            </div>
          ) : null}

          {activeOrder.washers.length > 0 ? (
            <ul
              aria-label={tBoard("washersLabel")}
              className="flex flex-wrap items-center gap-1.5"
            >
              <Users
                size={14}
                aria-hidden="true"
                className="text-muted-foreground"
              />
              {activeOrder.washers.map((washer) => (
                <li
                  key={washer.user_id}
                  className="bg-muted/60 inline-flex items-center rounded-full px-2 py-0.5 text-xs"
                >
                  {washer.name ?? "—"}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <div className="border-status-free/40 bg-status-free/5 mt-4 flex flex-col items-stretch gap-3 rounded-xl border border-dashed px-4 py-5 text-center">
          <p className="text-muted-foreground text-sm">{tBoard("freeHint")}</p>
          {hasCapability("orders.create") ? (
            <Link
              href="/orders/new"
              className={cn(
                buttonVariants({ variant: "default" }),
                "min-h-11 w-full gap-1.5",
              )}
            >
              <Plus size={16} aria-hidden="true" />
              {tBoard("newOrder")}
            </Link>
          ) : null}
        </div>
      )}

      {queue.length > 0 ? (
        <div className="mt-4 border-t pt-3">
          <div className="text-muted-foreground mb-2 flex items-center justify-between text-[11px] font-medium tracking-wide uppercase">
            <span>{tBoard("queue")}</span>
            <span className="font-mono">
              {tBoard("queueCount", { count: queue.length })}
            </span>
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {queue.map((order) => (
              <li
                key={order.id}
                className="bg-muted/50 inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-xs"
              >
                <span className="truncate">
                  {order.plate ?? tBoard("plateUnknown")}
                </span>
                <span className="text-muted-foreground font-mono">
                  {tBoard("orderNumberShort", { number: order.number })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

/**
 * Minutes elapsed since `startedAt`, refreshed each minute. Starts null on the
 * server and fills in on mount to avoid a hydration mismatch; this updates data
 * (no looping animation, per docs/UI.md).
 */
function useElapsed(startedAt: string | null): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!startedAt) {
      setNow(null);
      return;
    }
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [startedAt]);

  if (!startedAt || now == null) return null;
  return Math.max(
    0,
    Math.floor((now - new Date(startedAt).getTime()) / 60_000),
  );
}
