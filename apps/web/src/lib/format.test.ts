import { describe, expect, it } from "vitest";
import { formatDateTime, formatMoney, formatTime } from "@/lib/format";

describe("formatMoney", () => {
  it("derives the minor-unit scale from the currency (2 digits)", () => {
    expect(formatMoney(100, "KZT", "en")).toContain("1.00");
    expect(formatMoney(123456, "KZT", "en")).toContain("1,234.56");
  });

  it("handles zero-decimal currencies without inventing a fraction", () => {
    const result = formatMoney(1000, "JPY", "en");
    expect(result).toContain("1,000");
    expect(result).not.toContain("10.00");
  });

  it("handles three-decimal currencies", () => {
    expect(formatMoney(1234, "BHD", "en")).toContain("1.234");
  });

  it("formats with locale-specific grouping", () => {
    // ru uses a non-breaking/thin space as the grouping separator.
    expect(formatMoney(100000, "KZT", "ru")).toMatch(/1[\s  ]?000/);
  });
});

describe("formatDateTime", () => {
  const iso = "2026-06-17T12:00:00Z";

  it("renders the instant in the given IANA timezone", () => {
    const opts = {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    } as const;
    expect(formatDateTime(iso, "Asia/Almaty", "en", opts)).toBe("17:00"); // UTC+5
    expect(formatDateTime(iso, "UTC", "en", opts)).toBe("12:00");
  });

  it("formatTime returns a non-empty localized string", () => {
    expect(formatTime(iso, "Asia/Almaty", "en").length).toBeGreaterThan(0);
  });
});
