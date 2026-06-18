"use client";

import type { components } from "@carswash/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/api-client";

/**
 * Order list, detail, and the lifecycle mutations (create / close / cancel /
 * record payment). Mutations invalidate the board + order caches so the live
 * board and any open list/detail refresh after a write.
 */

export type OrderDetail = components["schemas"]["OrderDetailOut"];
export type OrderPage = components["schemas"]["OrderPage"];
export type OrderCreate = components["schemas"]["OrderCreate"];
export type PaymentCreate = components["schemas"]["PaymentCreate"];

export interface OrderListQuery {
  status?: components["schemas"]["OrderStatus"];
  box_id?: string;
  created_from?: string;
  created_to?: string;
  limit: number;
  offset: number;
}

export function useOrdersList(carWashId: string | null, query: OrderListQuery) {
  const client = useApiClient(carWashId);
  return useQuery({
    queryKey: ["orders", "list", carWashId, query],
    enabled: carWashId != null,
    queryFn: async (): Promise<OrderPage> => {
      const { data, error } = await client.GET("/orders", {
        params: { query },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useOrder(carWashId: string | null, orderId: string | null) {
  const client = useApiClient(carWashId);
  return useQuery({
    queryKey: ["orders", "detail", carWashId, orderId],
    enabled: carWashId != null && orderId != null,
    // Keep the detail fresh while it is open (board realtime invalidates the
    // list keys, not this one); mutations also invalidate it immediately.
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<OrderDetail> => {
      const { data, error } = await client.GET("/orders/{order_id}", {
        params: { path: { order_id: orderId as string } },
      });
      if (error) throw error;
      return data;
    },
  });
}

/** Invalidate everything the board + lists + a given order render from. */
function useOrderInvalidation(carWashId: string | null) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    queryClient.invalidateQueries({ queryKey: ["boxes", carWashId] });
    queryClient.invalidateQueries({
      queryKey: ["shift", "current", carWashId],
    });
  };
}

export function useCreateOrder(carWashId: string | null) {
  const client = useApiClient(carWashId);
  const invalidate = useOrderInvalidation(carWashId);
  return useMutation({
    mutationFn: async (body: OrderCreate): Promise<OrderDetail> => {
      const { data, error } = await client.POST("/orders", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useCloseOrder(carWashId: string | null) {
  const client = useApiClient(carWashId);
  const invalidate = useOrderInvalidation(carWashId);
  return useMutation({
    mutationFn: async (orderId: string): Promise<OrderDetail> => {
      const { data, error } = await client.POST("/orders/{order_id}/close", {
        params: { path: { order_id: orderId } },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useCancelOrder(carWashId: string | null) {
  const client = useApiClient(carWashId);
  const invalidate = useOrderInvalidation(carWashId);
  return useMutation({
    mutationFn: async (orderId: string): Promise<OrderDetail> => {
      const { data, error } = await client.POST("/orders/{order_id}/cancel", {
        params: { path: { order_id: orderId } },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useRecordPayment(carWashId: string | null) {
  const client = useApiClient(carWashId);
  const invalidate = useOrderInvalidation(carWashId);
  return useMutation({
    mutationFn: async (vars: { orderId: string; body: PaymentCreate }) => {
      const { data, error } = await client.POST("/orders/{order_id}/payments", {
        params: { path: { order_id: vars.orderId } },
        body: vars.body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}
