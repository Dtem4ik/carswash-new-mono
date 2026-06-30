import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dismissActionError,
  getActionError,
  navActionFor,
  reportActionError,
  subscribeActionError,
} from "@/lib/action-error";

afterEach(() => dismissActionError());

describe("reportActionError", () => {
  it("extracts the stable code from a FastAPI error body", () => {
    reportActionError({ detail: { code: "shift.not_open" } });
    expect(getActionError()).toEqual({ code: "shift.not_open" });
  });

  it("stores a null code for an uncoded error", () => {
    reportActionError(new Error("network"));
    expect(getActionError()).toEqual({ code: null });
  });

  it("notifies subscribers and clears on dismiss", () => {
    const seen: (string | null | undefined)[] = [];
    const unsub = subscribeActionError((e) => seen.push(e?.code ?? null));
    reportActionError({ detail: { code: "members.already_member" } });
    dismissActionError();
    unsub();
    // initial null, then the code, then null again
    expect(seen).toEqual([null, "members.already_member", null]);
  });
});

describe("navActionFor", () => {
  it("maps shift.not_open to the open-shift action", () => {
    expect(navActionFor("shift.not_open")).toEqual({
      href: "/shift",
      labelKey: "openShift",
    });
  });

  it("returns null for codes without a recovery and for null", () => {
    expect(navActionFor("members.forbidden_role")).toBeNull();
    expect(navActionFor(null)).toBeNull();
  });
});

describe("auto-dismiss is not wired here", () => {
  it("keeps the error until dismissed", () => {
    vi.useFakeTimers();
    reportActionError({ detail: { code: "order.empty" } });
    vi.advanceTimersByTime(10_000);
    expect(getActionError()?.code).toBe("order.empty");
    vi.useRealTimers();
  });
});
