import { describe, expect, it } from "vitest";
import {
  BOX_STATUS_TONE,
  ORDER_STATUS_TONE,
  PAYMENT_STATUS_TONE,
  TONE_BAR_CLASS,
  TONE_DOT_CLASS,
  TONE_PILL_CLASS,
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

  it("every referenced tone has dot, pill, and bar classes", () => {
    const tones = new Set([
      ...Object.values(ORDER_STATUS_TONE),
      ...Object.values(BOX_STATUS_TONE),
      ...Object.values(PAYMENT_STATUS_TONE),
    ]);
    for (const tone of tones) {
      // A vivid dot/bar fill plus a tinted pill (background + label ink).
      expect(TONE_DOT_CLASS[tone]).toMatch(/^bg-/);
      expect(TONE_BAR_CLASS[tone]).toMatch(/^bg-/);
      expect(TONE_PILL_CLASS[tone]).toMatch(/bg-tone-/);
      expect(TONE_PILL_CLASS[tone]).toMatch(/text-tone-.*-fg/);
    }
  });

  it("uses the same vivid fill for dots and bay accent bars", () => {
    expect(TONE_BAR_CLASS).toEqual(TONE_DOT_CLASS);
  });
});
