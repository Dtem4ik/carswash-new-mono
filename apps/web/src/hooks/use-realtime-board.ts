"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to Supabase Realtime changes on `orders` and `boxes` for the active
 * car wash and invalidates the board queries on any change, so the board reflects
 * orders created/closed elsewhere without a manual refresh. RLS gates the rows;
 * the filter narrows them to this car wash. The channel is torn down on unmount
 * or when the active car wash changes.
 */
export function useRealtimeBoard(carWashId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!carWashId) return;

    const supabase = createClient();
    const filter = `car_wash_id=eq.${carWashId}`;
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["boxes", carWashId] });
      queryClient.invalidateQueries({ queryKey: ["orders", carWashId] });
    };

    const channel = supabase
      .channel(`board:${carWashId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter },
        invalidate,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "boxes", filter },
        invalidate,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [carWashId, queryClient]);
}
