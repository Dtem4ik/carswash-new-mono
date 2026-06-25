"use client";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  type BoxOut,
  mergeRealtimeOrder,
  type OrderDetailOut,
  type OrderOut,
  type RealtimeOrderPatch,
  removeActiveOrder,
  setBoxStatus,
} from "@/lib/order-cache";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps the board live from Supabase Realtime on `orders` and `boxes` for the
 * active car wash. Instead of refetching on every change, it PATCHES the query
 * cache from the changed row — instant, and it de-dupes our own optimistic
 * echo by id (a change to an order already in the cache just overlays its
 * scalars). A change it cannot fully apply from the raw row — a new order from
 * another client, which lacks washers/client joins — schedules a single
 * debounced background refetch that reconciles without a visible reload. RLS
 * gates the rows; the filter narrows them to this car wash.
 */

const RECONCILE_DEBOUNCE_MS = 600;

function orderPatch(row: Record<string, unknown>): RealtimeOrderPatch {
  return {
    id: row.id as string,
    box_id: row.box_id as string,
    status: row.status as OrderOut["status"],
    payment_status: row.payment_status as OrderOut["payment_status"],
    total_minor: row.total_minor as number,
    plate: (row.plate as string | null) ?? null,
    number: row.number as number,
    started_at: (row.started_at as string | null) ?? null,
    finished_at: (row.finished_at as string | null) ?? null,
  };
}

export function useRealtimeBoard(carWashId: string | null) {
  const queryClient = useQueryClient();
  const reconcileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!carWashId) return;

    const supabase = createClient();
    const filter = `car_wash_id=eq.${carWashId}`;
    const ordersKey = ["orders", carWashId];
    const boxesKey = ["boxes", carWashId];

    // Coalesce events we cannot fully patch into one background refetch; active
    // observers refresh in place (no skeleton, previous data stays visible).
    const scheduleReconcile = () => {
      if (reconcileTimer.current) clearTimeout(reconcileTimer.current);
      reconcileTimer.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ordersKey });
        queryClient.invalidateQueries({ queryKey: boxesKey });
      }, RECONCILE_DEBOUNCE_MS);
    };

    const onOrders = (
      payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
    ) => {
      if (payload.eventType === "DELETE") {
        const id = (payload.old as { id?: string }).id;
        if (id) {
          queryClient.setQueryData<OrderOut[]>(ordersKey, (list) =>
            removeActiveOrder(list ?? [], id),
          );
        }
        return;
      }

      const patch = orderPatch(payload.new as Record<string, unknown>);
      let handled = false;
      queryClient.setQueryData<OrderOut[]>(ordersKey, (list) => {
        const result = mergeRealtimeOrder(list ?? [], patch);
        handled = result.handled;
        return result.list;
      });

      // Overlay the changed scalars onto an open detail view, if any.
      queryClient.setQueryData<OrderDetailOut>(
        ["orders", "detail", carWashId, patch.id],
        (detail) => (detail ? { ...detail, ...patch } : detail),
      );

      if (!handled) scheduleReconcile();
    };

    const onBoxes = (
      payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
    ) => {
      if (payload.eventType === "DELETE") {
        scheduleReconcile();
        return;
      }
      const row = payload.new as { id?: string; status?: BoxOut["status"] };
      if (!row.id || !row.status) return;
      const cached = queryClient.getQueryData<BoxOut[]>(boxesKey);
      if (cached?.some((b) => b.id === row.id)) {
        queryClient.setQueryData(
          boxesKey,
          setBoxStatus(cached, row.id, row.status),
        );
      } else {
        scheduleReconcile();
      }
    };

    const channel = supabase
      .channel(`board:${carWashId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter },
        onOrders,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "boxes", filter },
        onBoxes,
      )
      .subscribe();

    return () => {
      if (reconcileTimer.current) clearTimeout(reconcileTimer.current);
      supabase.removeChannel(channel);
    };
  }, [carWashId, queryClient]);
}
