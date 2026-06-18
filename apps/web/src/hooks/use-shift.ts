"use client";

import type { components } from "@carswash/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/api-client";

/**
 * Shift lifecycle mutations: open, record a cash movement, and close (returns the
 * till reconciliation). Each invalidates the current-shift + board caches so the
 * shift screen and the board context strip refresh together.
 */

export type ShiftOpen = components["schemas"]["ShiftOpen"];
export type ShiftClose = components["schemas"]["ShiftClose"];
export type ShiftCloseOut = components["schemas"]["ShiftCloseOut"];
export type CashMovementCreate = components["schemas"]["CashMovementCreate"];
export type CashMovementType = components["schemas"]["CashMovementType"];

function useShiftInvalidation(carWashId: string | null) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({
      queryKey: ["shift", "current", carWashId],
    });
    queryClient.invalidateQueries({ queryKey: ["boxes", carWashId] });
    queryClient.invalidateQueries({ queryKey: ["orders"] });
  };
}

export function useOpenShift(carWashId: string | null) {
  const client = useApiClient(carWashId);
  const invalidate = useShiftInvalidation(carWashId);
  return useMutation({
    mutationFn: async (body: ShiftOpen) => {
      const { data, error } = await client.POST("/shifts/open", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useRecordCashMovement(carWashId: string | null) {
  const client = useApiClient(carWashId);
  const invalidate = useShiftInvalidation(carWashId);
  return useMutation({
    mutationFn: async (body: CashMovementCreate) => {
      const { data, error } = await client.POST(
        "/shifts/current/cash-movements",
        { body },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useCloseShift(carWashId: string | null) {
  const client = useApiClient(carWashId);
  const invalidate = useShiftInvalidation(carWashId);
  return useMutation({
    mutationFn: async (body: ShiftClose): Promise<ShiftCloseOut> => {
      const { data, error } = await client.POST("/shifts/close", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}
