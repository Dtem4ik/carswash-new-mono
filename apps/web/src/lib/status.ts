import type { components } from "@carswash/shared";

/**
 * Maps backend status CODES to a visual "tone". The backend always returns
 * stable codes (see ARCHITECTURE §8); colors and labels live entirely on the
 * edge. Tones resolve to status-color tokens defined in globals.css.
 */

type OrderStatus = components["schemas"]["OrderStatus"];
type BoxStatus = components["schemas"]["BoxStatus"];
type PaymentStatus = components["schemas"]["OrderPaymentStatus"];

export type StatusTone =
  | "free"
  | "progress"
  | "queued"
  | "done"
  | "cancelled"
  | "pay-unpaid"
  | "pay-paid"
  | "pay-credit"
  | "pay-refunded";

export const ORDER_STATUS_TONE: Record<OrderStatus, StatusTone> = {
  queued: "queued",
  in_progress: "progress",
  done: "done",
  cancelled: "cancelled",
};

export const BOX_STATUS_TONE: Record<BoxStatus, StatusTone> = {
  free: "free",
  busy: "progress",
};

export const PAYMENT_STATUS_TONE: Record<PaymentStatus, StatusTone> = {
  unpaid: "pay-unpaid",
  partial: "pay-unpaid",
  paid: "pay-paid",
  credit: "pay-credit",
  refunded: "pay-refunded",
};

/**
 * Tone → vivid dot color class (also used for the bay accent bar). Literal class
 * strings (not built dynamically) so Tailwind keeps them. Status is shown as
 * dot + label, never color alone.
 */
export const TONE_DOT_CLASS: Record<StatusTone, string> = {
  free: "bg-status-free",
  progress: "bg-status-progress",
  queued: "bg-status-queued",
  done: "bg-status-done",
  cancelled: "bg-status-cancelled",
  "pay-unpaid": "bg-pay-unpaid",
  "pay-paid": "bg-pay-paid",
  "pay-credit": "bg-pay-credit",
  "pay-refunded": "bg-pay-refunded",
};

/**
 * Tone → tinted-pill classes (soft background + AA-legible label ink). Several
 * tones share a color family (e.g. unpaid reuses amber, paid reuses green), so
 * they resolve to the same tone tokens. Literal strings keep Tailwind happy.
 */
export const TONE_PILL_CLASS: Record<StatusTone, string> = {
  free: "bg-tone-green-bg text-tone-green-fg",
  progress: "bg-tone-blue-bg text-tone-blue-fg",
  queued: "bg-tone-amber-bg text-tone-amber-fg",
  done: "bg-tone-slate-bg text-tone-slate-fg",
  cancelled: "bg-tone-rose-bg text-tone-rose-fg",
  "pay-unpaid": "bg-tone-amber-bg text-tone-amber-fg",
  "pay-paid": "bg-tone-green-bg text-tone-green-fg",
  "pay-credit": "bg-tone-violet-bg text-tone-violet-fg",
  "pay-refunded": "bg-tone-rose-bg text-tone-rose-fg",
};

/** Tone → vivid solid class for the bay's left accent bar. */
export const TONE_BAR_CLASS: Record<StatusTone, string> = TONE_DOT_CLASS;
