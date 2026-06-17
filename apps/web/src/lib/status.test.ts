import { describe, expect, it } from "vitest";
import {
  BOX_STATUS_TONE,
  ORDER_STATUS_TONE,
  PAYMENT_STATUS_TONE,
  TONE_DOT_CLASS,
} from "@/lib/status";

describe("status tone maps", () => {
  it("maps order statuses to the right tones", () => {
    expect(ORDER_STATUS_TONE).toEqual({
      queued: "queued",
      in_progress: "progress",
      done: "done",
      cancelled: "cancelled",
    });
  });

  it("maps box statuses (busy uses the accent tone)", () => {
    expect(BOX_STATUS_TONE).toEqual({ free: "free", busy: "progress" });
  });

  it("maps payment statuses (partial reuses the unpaid tone)", () => {
    expect(PAYMENT_STATUS_TONE).toEqual({
      unpaid: "pay-unpaid",
      partial: "pay-unpaid",
      paid: "pay-paid",
      credit: "pay-credit",
      refunded: "pay-refunded",
    });
  });

  it("every referenced tone has a dot color class", () => {
    const tones = new Set([
      ...Object.values(ORDER_STATUS_TONE),
      ...Object.values(BOX_STATUS_TONE),
      ...Object.values(PAYMENT_STATUS_TONE),
    ]);
    for (const tone of tones) {
      expect(TONE_DOT_CLASS[tone]).toMatch(/^bg-/);
    }
  });
});
