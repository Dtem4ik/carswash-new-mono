"use client";

import type { components } from "@carswash/shared";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/api-client";

export type Box = components["schemas"]["BoxOut"];
export type Order = components["schemas"]["OrderOut"];

/** Boxes for the active car wash. */
export function useBoxes(carWashId: string | null) {
  const client = useApiClient(carWashId);
  return useQuery({
    queryKey: ["boxes", carWashId],
    enabled: carWashId != null,
    queryFn: async (): Promise<Box[]> => {
      const { data, error } = await client.GET("/boxes", {});
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Active orders for the board: everything in_progress or queued. The list
 * endpoint filters by a single status, so we fetch both and merge.
 */
export function useActiveOrders(carWashId: string | null) {
  const client = useApiClient(carWashId);
  return useQuery({
    queryKey: ["orders", carWashId],
    enabled: carWashId != null,
    queryFn: async (): Promise<Order[]> => {
      const [inProgress, queued] = await Promise.all([
        client.GET("/orders", {
          params: { query: { status: "in_progress", limit: 200 } },
        }),
        client.GET("/orders", {
          params: { query: { status: "queued", limit: 200 } },
        }),
      ]);
      if (inProgress.error) throw inProgress.error;
      if (queued.error) throw queued.error;
      return [...inProgress.data.items, ...queued.data.items];
    },
  });
}
