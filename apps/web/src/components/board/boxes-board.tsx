"use client";

import { Warning } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { BoardSkeleton } from "@/components/board/board-skeleton";
import { BoxCard } from "@/components/board/box-card";
import { Button } from "@/components/ui/button";
import { type Order, useActiveOrders, useBoxes } from "@/hooks/use-board-data";
import { useRealtimeBoard } from "@/hooks/use-realtime-board";
import { extractErrorCode, resolveErrorMessage } from "@/lib/errors";
import { useTenant } from "@/lib/tenant-context";

interface BoxOrders {
  active: Order | null;
  queue: Order[];
}

/** The live boxes board: initial load via the API, kept live via Realtime. */
export function BoxesBoard() {
  const { activeCarWash } = useTenant();
  const carWashId = activeCarWash?.id ?? null;

  const boxesQuery = useBoxes(carWashId);
  const ordersQuery = useActiveOrders(carWashId);
  useRealtimeBoard(carWashId);

  const tBoard = useTranslations("board");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");

  const ordersByBox = useMemo(() => {
    const map = new Map<string, BoxOrders>();
    for (const order of ordersQuery.data ?? []) {
      const entry = map.get(order.box_id) ?? { active: null, queue: [] };
      if (order.status === "in_progress") {
        entry.active = order;
      } else if (order.status === "queued") {
        entry.queue.push(order);
      }
      map.set(order.box_id, entry);
    }
    for (const entry of map.values()) {
      entry.queue.sort((a, b) => a.number - b.number);
    }
    return map;
  }, [ordersQuery.data]);

  if (!activeCarWash) {
    return <EmptyState title={tBoard("empty")} hint={tBoard("emptyHint")} />;
  }

  if (boxesQuery.isPending) {
    return <BoardSkeleton />;
  }

  if (boxesQuery.isError) {
    const message = resolveErrorMessage(
      tErrors,
      extractErrorCode(boxesQuery.error),
    );
    return (
      <div
        role="alert"
        className="border-destructive/30 bg-destructive/5 text-destructive flex flex-col items-start gap-3 rounded-xl border p-5 text-sm"
      >
        <div className="flex items-center gap-2 font-medium">
          <Warning size={18} weight="fill" aria-hidden="true" />
          {tBoard("loadError")}
        </div>
        <p>{message}</p>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => {
            boxesQuery.refetch();
            ordersQuery.refetch();
          }}
        >
          {tCommon("retry")}
        </Button>
      </div>
    );
  }

  const boxes = boxesQuery.data;
  if (boxes.length === 0) {
    return <EmptyState title={tBoard("empty")} hint={tBoard("emptyHint")} />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {boxes.map((box) => {
        const entry = ordersByBox.get(box.id);
        return (
          <BoxCard
            key={box.id}
            box={box}
            activeOrder={entry?.active ?? null}
            queue={entry?.queue ?? []}
            currency={activeCarWash.currency}
            timeZone={activeCarWash.timezone}
          />
        );
      })}
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed p-12 text-center">
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground max-w-sm text-sm">{hint}</p>
    </div>
  );
}
