import { describe, expect, it } from "vitest";
import {
  type ErrorTranslator,
  extractErrorCode,
  resolveErrorMessage,
} from "@/lib/errors";

function fakeTranslator(map: Record<string, string>): ErrorTranslator {
  const t = ((key: string) => map[key] ?? key) as ErrorTranslator;
  t.has = (key: string) => key in map;
  return t;
}

describe("extractErrorCode", () => {
  it("pulls the code from a FastAPI error body", () => {
    expect(extractErrorCode({ detail: { code: "shift.not_open" } })).toBe(
      "shift.not_open",
    );
  });

  it("returns undefined for malformed errors", () => {
    expect(extractErrorCode(null)).toBeUndefined();
    expect(extractErrorCode("boom")).toBeUndefined();
    expect(extractErrorCode({})).toBeUndefined();
    expect(extractErrorCode({ detail: {} })).toBeUndefined();
    expect(extractErrorCode({ detail: { code: 42 } })).toBeUndefined();
  });
});

describe("resolveErrorMessage", () => {
  const t = fakeTranslator({
    unknown: "Unexpected error",
    "shift.not_open": "No shift is open",
  });

  it("resolves a known code", () => {
    expect(resolveErrorMessage(t, "shift.not_open")).toBe("No shift is open");
  });

  it("falls back to the generic message for unknown or missing codes", () => {
    expect(resolveErrorMessage(t, "does.not.exist")).toBe("Unexpected error");
    expect(resolveErrorMessage(t, undefined)).toBe("Unexpected error");
    expect(resolveErrorMessage(t, null)).toBe("Unexpected error");
  });
});
