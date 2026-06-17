"use client";

import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import type { Box, Order } from "@/hooks/use-board-data";
import { useFormatters } from "@/lib/format";
import {
  BOX_STATUS_TONE,
  ORDER_STATUS_TONE,
  PAYMENT_STATUS_TONE,
} from "@/lib/status";

interface Props {
  box: Box;
  activeOrder: Order | null;
  queue: Order[];
  currency: string;
  timeZone: string;
}

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

  return (
    <Card className="gap-0 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate font-medium">{box.name}</h3>
        <StatusBadge
          tone={BOX_STATUS_TONE[box.status]}
          label={tBox(box.status)}
        />
      </div>

      {activeOrder ? (
        <div className="mt-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <span className="truncate font-medium">
              {activeOrder.plate ?? tBoard("plateUnknown")}
            </span>
            <StatusBadge
              tone={ORDER_STATUS_TONE[activeOrder.status]}
              label={tOrder(activeOrder.status)}
            />
          </div>
          <div className="text-muted-foreground flex items-center gap-2 font-mono text-xs">
            <span>{tBoard("orderNumber", { number: activeOrder.number })}</span>
            {activeOrder.started_at ? (
              <span>· {fmt.time(activeOrder.started_at, timeZone)}</span>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="font-mono text-base font-semibold">
              {fmt.money(activeOrder.total_minor, currency)}
            </span>
            <StatusBadge
              tone={PAYMENT_STATUS_TONE[activeOrder.payment_status]}
              label={tPay(activeOrder.payment_status)}
            />
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground mt-4 text-sm">{tBox("free")}</p>
      )}

      {activeOrder || queue.length > 0 ? (
        <div className="mt-4 border-t pt-3">
          <div className="text-muted-foreground mb-2 flex items-center justify-between text-xs font-medium tracking-wide uppercase">
            <span>{tBoard("queue")}</span>
            <span className="font-mono">
              {tBoard("queueCount", { count: queue.length })}
            </span>
          </div>
          {queue.length > 0 ? (
            <ul className="space-y-1.5">
              {queue.map((order) => (
                <li
                  key={order.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="truncate">
                    {order.plate ?? tBoard("plateUnknown")}
                  </span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {tBoard("orderNumber", { number: order.number })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              {tBoard("queueEmpty")}
            </p>
          )}
        </div>
      ) : null}
    </Card>
  );
}
