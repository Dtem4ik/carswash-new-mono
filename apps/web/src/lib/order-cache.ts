import type { components } from "@carswash/shared";

/**
 * Pure reducers over the TanStack Query caches that back the live board and
 * order detail. They are used in three places:
 *
 * - optimistic mutation `onMutate` (reflect a create / close / cancel / payment
 *   instantly, before the server answers);
 * - global mutation reconciliation `onSuccess` (replace the optimistic entry
 *   with the authoritative server row);
 * - realtime `postgres_changes` patching (apply a change from another client by
 *   merging the raw row, no full refetch).
 *
 * Keeping them pure makes the patching logic unit-testable and keeps the hooks
 * thin. The board's active-orders cache holds only `in_progress`/`queued`
 * orders, so any reducer that pushes an order out of those statuses drops it
 * from the list — mirroring what a refetch would return.
 */

export type OrderOut = components["schemas"]["OrderOut"];
export type OrderDetailOut = components["schemas"]["OrderDetailOut"];
export type BoxOut = components["schemas"]["BoxOut"];
export type PaymentOut = components["schemas"]["PaymentOut"];
type OrderStatus = components["schemas"]["OrderStatus"];

/** Optimistic orders carry a client-minted id with this prefix until reconciled. */
export const OPTIMISTIC_PREFIX = "optimistic-";

export function isOptimisticId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_PREFIX);
}

export function newOptimisticId(): string {
  return `${OPTIMISTIC_PREFIX}${crypto.randomUUID()}`;
}

function isActive(status: OrderStatus): boolean {
  return status === "in_progress" || status === "queued";
}

/**
 * Upsert an order into the active-orders list by id. If the order is no longer
 * active (done/cancelled) it is removed instead, so the list stays consistent
 * with the board's "in_progress + queued" query.
 */
export function applyActiveOrder(
  list: OrderOut[],
  order: OrderOut,
): OrderOut[] {
  const without = list.filter((o) => o.id !== order.id);
  return isActive(order.status) ? [...without, order] : without;
}

export function removeActiveOrder(list: OrderOut[], id: string): OrderOut[] {
  return list.filter((o) => o.id !== id);
}

/**
 * Remove a closed/cancelled order from the active list and, if it was the
 * in_progress order on its box, promote the oldest queued order on that box to
 * in_progress — mirroring the server's `_promote_box_queue`.
 */
export function closeOrCancelOrder(
  list: OrderOut[],
  orderId: string,
  nowIso: string,
): OrderOut[] {
  const order = list.find((o) => o.id === orderId);
  if (!order) return list;
  const next = list.filter((o) => o.id !== orderId);
  if (order.status !== "in_progress") return next;

  const promote = next
    .filter((o) => o.box_id === order.box_id && o.status === "queued")
    .sort((a, b) => a.number - b.number)[0];
  if (!promote) return next;
  return next.map((o) =>
    o.id === promote.id
      ? { ...o, status: "in_progress", started_at: o.started_at ?? nowIso }
      : o,
  );
}

/** Project a full order detail down to the board's lighter list shape. */
export function detailToOrderOut(d: OrderDetailOut): OrderOut {
  return {
    box_id: d.box_id,
    car_brand: d.car_brand,
    car_model: d.car_model,
    car_type_id: d.car_type_id,
    car_wash_id: d.car_wash_id,
    client_car_id: d.client_car_id,
    client_name: d.client_name,
    client_phone: d.client_phone,
    created_at: d.created_at,
    created_by: d.created_by,
    currency: d.currency,
    discount_amount_minor: d.discount_amount_minor,
    discount_type: d.discount_type,
    finished_at: d.finished_at,
    finished_by: d.finished_by,
    id: d.id,
    number: d.number,
    package_id: d.package_id,
    payment_status: d.payment_status,
    plate: d.plate,
    shift_id: d.shift_id,
    started_at: d.started_at,
    status: d.status,
    subtotal_minor: d.subtotal_minor,
    total_minor: d.total_minor,
    washers: d.washers.map((w) => ({ user_id: w.user_id, name: w.name })),
  };
}

/** Inputs the intake form already holds, enough to render a believable bay card. */
export interface OptimisticOrderInput {
  id: string;
  boxId: string;
  carWashId: string;
  carTypeId: string;
  plate: string | null;
  clientName: string | null;
  clientPhone: string | null;
  totalMinor: number;
  subtotalMinor: number;
  discountMinor: number;
  currency: string;
  /** Free box → start immediately (in_progress); occupied box → queue. */
  boxFree: boolean;
  /** Corporate clients wash on credit from day one. */
  corporate: boolean;
  washers: { user_id: string; name: string | null }[];
  nowIso: string;
}

/** Build the optimistic board row shown the instant an order is submitted. */
export function buildOptimisticOrder(input: OptimisticOrderInput): OrderOut {
  return {
    box_id: input.boxId,
    car_brand: null,
    car_model: null,
    car_type_id: input.carTypeId,
    car_wash_id: input.carWashId,
    client_car_id: null,
    client_name: input.clientName,
    client_phone: input.clientPhone,
    created_at: input.nowIso,
    created_by: "",
    currency: input.currency,
    discount_amount_minor: input.discountMinor,
    discount_type: "none",
    finished_at: null,
    finished_by: null,
    id: input.id,
    number: 0,
    package_id: null,
    payment_status: input.corporate ? "credit" : "unpaid",
    plate: input.plate,
    shift_id: "",
    started_at: input.boxFree ? input.nowIso : null,
    status: input.boxFree ? "in_progress" : "queued",
    subtotal_minor: input.subtotalMinor,
    total_minor: input.totalMinor,
    washers: input.washers,
  };
}

/** A box is busy iff it currently has an in_progress order on the board. */
export function boxBusyFromList(list: OrderOut[], boxId: string): boolean {
  return list.some((o) => o.box_id === boxId && o.status === "in_progress");
}

export function setBoxStatus(
  boxes: BoxOut[],
  boxId: string,
  status: BoxOut["status"],
): BoxOut[] {
  return boxes.map((b) => (b.id === boxId ? { ...b, status } : b));
}

/** Recompute one box's status from the active list (used after close/cancel). */
export function syncBoxStatus(
  boxes: BoxOut[],
  list: OrderOut[],
  boxId: string,
): BoxOut[] {
  return setBoxStatus(
    boxes,
    boxId,
    boxBusyFromList(list, boxId) ? "busy" : "free",
  );
}

/** The scalar subset of a raw `orders` row a realtime patch can safely overlay. */
export type RealtimeOrderPatch = Pick<
  OrderOut,
  | "id"
  | "box_id"
  | "status"
  | "payment_status"
  | "total_minor"
  | "plate"
  | "number"
  | "started_at"
  | "finished_at"
>;

/**
 * Merge a realtime order change into the active list. Only orders already in
 * the cache are patched (we have their full data and just overlay the changed
 * scalars); an unknown order — created by another client — cannot be rendered
 * fully from the raw row, so `handled` is false and the caller schedules a
 * debounced background refetch to fill it in.
 */
export function mergeRealtimeOrder(
  list: OrderOut[],
  patch: RealtimeOrderPatch,
): { list: OrderOut[]; handled: boolean } {
  const existing = list.find((o) => o.id === patch.id);
  if (!existing) return { list, handled: false };
  return {
    list: applyActiveOrder(list, { ...existing, ...patch }),
    handled: true,
  };
}

/**
 * Append a payment to an order detail and recompute the money rollups and the
 * payment status, mirroring the server's `_recompute_payment_status`. The
 * server response later reconciles the exact figures.
 */
export function recordPaymentOnDetail(
  detail: OrderDetailOut,
  payment: PaymentOut,
): OrderDetailOut {
  const payments = [...detail.payments, payment];
  const net =
    detail.paid_total_minor +
    (payment.kind === "refund" ? -payment.amount_minor : payment.amount_minor);
  const corporate = detail.payment_status === "credit";
  const refunded = payments.some((p) => p.kind === "refund");

  let payment_status: OrderDetailOut["payment_status"];
  if (refunded && net <= 0) payment_status = "refunded";
  else if (net <= 0) payment_status = corporate ? "credit" : "unpaid";
  else if (net < detail.total_minor) payment_status = "partial";
  else payment_status = "paid";

  return {
    ...detail,
    payments,
    paid_total_minor: net,
    balance_minor: detail.total_minor - net,
    payment_status,
  };
}
