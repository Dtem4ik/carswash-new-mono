"use client";

import type { components } from "@carswash/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/api-client";
import {
  applyActiveOrder,
  buildOptimisticOrder,
  closeOrCancelOrder,
  detailToOrderOut,
  type OptimisticOrderInput,
  type OrderDetailOut as OrderDetailShape,
  type OrderOut,
  type PaymentOut,
  recordPaymentOnDetail,
  removeActiveOrder,
  setBoxStatus,
  syncBoxStatus,
} from "@/lib/order-cache";
import type { OptimisticContext } from "@/lib/query-client";

/**
 * Order list, detail, and the lifecycle mutations (create / close / cancel /
 * record payment). Every mutation updates the board + detail caches
 * optimistically so the action reflects with no perceptible wait; the global
 * mutation cache (see `lib/query-client.ts`) reconciles with the server
 * response and rolls back on error. Realtime echoes are de-duped by id when the
 * board patches its cache (see `use-realtime-board.ts`).
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

const activeOrdersKey = (carWashId: string | null) => ["orders", carWashId];
const boxesKey = (carWashId: string | null) => ["boxes", carWashId];
const detailKey = (carWashId: string | null, orderId: string) => [
  "orders",
  "detail",
  carWashId,
  orderId,
];
const shiftKey = (carWashId: string | null) => ["shift", "current", carWashId];

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
    // list keys, not this one); mutations also patch it immediately.
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

/** Variables for an optimistic create: the API body plus the board preview. */
export interface CreateOrderVars {
  body: OrderCreate;
  optimistic: OptimisticOrderInput;
}

export function useCreateOrder(carWashId: string | null) {
  const client = useApiClient(carWashId);
  const queryClient = useQueryClient();

  return useMutation<OrderDetail, unknown, CreateOrderVars, OptimisticContext>({
    mutationFn: async ({ body }): Promise<OrderDetail> => {
      const { data, error } = await client.POST("/orders", { body });
      if (error) throw error;
      return data;
    },
    onMutate: async ({ optimistic }): Promise<OptimisticContext> => {
      const ordersKey = activeOrdersKey(carWashId);
      const bKey = boxesKey(carWashId);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ordersKey }),
        queryClient.cancelQueries({ queryKey: bKey }),
      ]);

      const prevOrders = queryClient.getQueryData<OrderOut[]>(ordersKey);
      const prevBoxes =
        queryClient.getQueryData<components["schemas"]["BoxOut"][]>(bKey);

      const order = buildOptimisticOrder(optimistic);
      queryClient.setQueryData<OrderOut[]>(ordersKey, (list) =>
        applyActiveOrder(list ?? [], order),
      );
      if (order.status === "in_progress" && prevBoxes) {
        queryClient.setQueryData(
          bKey,
          setBoxStatus(prevBoxes, order.box_id, "busy"),
        );
      }

      return {
        rollback: () => {
          queryClient.setQueryData(ordersKey, prevOrders);
          queryClient.setQueryData(bKey, prevBoxes);
        },
        reconcile: (data) => {
          const detail = data as OrderDetailShape;
          const real = detailToOrderOut(detail);
          const next = applyActiveOrder(
            removeActiveOrder(
              queryClient.getQueryData<OrderOut[]>(ordersKey) ?? [],
              optimistic.id,
            ),
            real,
          );
          queryClient.setQueryData(ordersKey, next);
          const boxes =
            queryClient.getQueryData<components["schemas"]["BoxOut"][]>(bKey);
          if (boxes) {
            queryClient.setQueryData(
              bKey,
              syncBoxStatus(boxes, next, real.box_id),
            );
          }
          queryClient.setQueryData(detailKey(carWashId, real.id), detail);
          queryClient.invalidateQueries({ queryKey: shiftKey(carWashId) });
        },
      };
    },
  });
}

/** Shared close/cancel optimistic flow (both end an active order). */
function useEndOrder(
  carWashId: string | null,
  path: "/orders/{order_id}/close" | "/orders/{order_id}/cancel",
) {
  const client = useApiClient(carWashId);
  const queryClient = useQueryClient();

  return useMutation<OrderDetail, unknown, string, OptimisticContext>({
    mutationFn: async (orderId: string): Promise<OrderDetail> => {
      const { data, error } = await client.POST(path, {
        params: { path: { order_id: orderId } },
      });
      if (error) throw error;
      return data;
    },
    onMutate: async (orderId): Promise<OptimisticContext> => {
      const ordersKey = activeOrdersKey(carWashId);
      const bKey = boxesKey(carWashId);
      const dKey = detailKey(carWashId, orderId);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ordersKey }),
        queryClient.cancelQueries({ queryKey: bKey }),
        queryClient.cancelQueries({ queryKey: dKey }),
      ]);

      const prevOrders = queryClient.getQueryData<OrderOut[]>(ordersKey);
      const prevBoxes =
        queryClient.getQueryData<components["schemas"]["BoxOut"][]>(bKey);
      const prevDetail = queryClient.getQueryData<OrderDetailShape>(dKey);

      const closing = path.endsWith("/close");
      const nowIso = new Date().toISOString();
      const boxId = (prevOrders ?? []).find((o) => o.id === orderId)?.box_id;

      const next = closeOrCancelOrder(prevOrders ?? [], orderId, nowIso);
      queryClient.setQueryData(ordersKey, next);
      if (prevBoxes && boxId) {
        queryClient.setQueryData(bKey, syncBoxStatus(prevBoxes, next, boxId));
      }
      if (prevDetail) {
        queryClient.setQueryData<OrderDetailShape>(dKey, {
          ...prevDetail,
          status: closing ? "done" : "cancelled",
          finished_at: nowIso,
        });
      }

      return {
        rollback: () => {
          queryClient.setQueryData(ordersKey, prevOrders);
          queryClient.setQueryData(bKey, prevBoxes);
          queryClient.setQueryData(dKey, prevDetail);
        },
        reconcile: (data) => {
          queryClient.setQueryData(dKey, data as OrderDetailShape);
          // Promotion of the next queued order and the box's exact state are
          // server-decided; reconcile them with a background refetch.
          queryClient.invalidateQueries({ queryKey: ["orders"] });
          queryClient.invalidateQueries({ queryKey: bKey });
          queryClient.invalidateQueries({ queryKey: shiftKey(carWashId) });
        },
      };
    },
  });
}

export function useCloseOrder(carWashId: string | null) {
  return useEndOrder(carWashId, "/orders/{order_id}/close");
}

export function useCancelOrder(carWashId: string | null) {
  return useEndOrder(carWashId, "/orders/{order_id}/cancel");
}

export function useRecordPayment(carWashId: string | null) {
  const client = useApiClient(carWashId);
  const queryClient = useQueryClient();

  return useMutation<
    PaymentOut,
    unknown,
    { orderId: string; body: PaymentCreate },
    OptimisticContext
  >({
    // The payment dialog stays mounted and shows the error inline.
    meta: { errorMode: "inline" },
    mutationFn: async (vars): Promise<PaymentOut> => {
      const { data, error } = await client.POST("/orders/{order_id}/payments", {
        params: { path: { order_id: vars.orderId } },
        body: vars.body,
      });
      if (error) throw error;
      return data;
    },
    onMutate: async ({ orderId, body }): Promise<OptimisticContext> => {
      const dKey = detailKey(carWashId, orderId);
      const ordersKey = activeOrdersKey(carWashId);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: dKey }),
        queryClient.cancelQueries({ queryKey: ordersKey }),
      ]);

      const prevDetail = queryClient.getQueryData<OrderDetailShape>(dKey);
      const prevOrders = queryClient.getQueryData<OrderOut[]>(ordersKey);

      const reconcile = () => {
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: shiftKey(carWashId) });
      };

      if (!prevDetail) {
        return { rollback: () => {}, reconcile };
      }

      const optimisticPayment: PaymentOut = {
        id: `optimistic-${crypto.randomUUID()}`,
        amount_minor: body.amount_minor,
        currency: prevDetail.currency,
        kind: body.kind,
        method: body.method,
        paid_at: new Date().toISOString(),
        received_by: null,
      };
      const nextDetail = recordPaymentOnDetail(prevDetail, optimisticPayment);
      queryClient.setQueryData(dKey, nextDetail);
      if (prevOrders) {
        queryClient.setQueryData(
          ordersKey,
          prevOrders.map((o) =>
            o.id === orderId
              ? { ...o, payment_status: nextDetail.payment_status }
              : o,
          ),
        );
      }

      return {
        rollback: () => {
          queryClient.setQueryData(dKey, prevDetail);
          queryClient.setQueryData(ordersKey, prevOrders);
        },
        reconcile,
      };
    },
  });
}
