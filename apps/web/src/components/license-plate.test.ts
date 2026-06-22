import { describe, expect, it } from "vitest";
import {
  KZ_PLATE_PATTERN,
  normalizePlate,
  resolvePlate,
} from "@/components/license-plate";

describe("normalizePlate", () => {
  it("strips spaces and uppercases", () => {
    expect(normalizePlate(" 777 abc 02 ")).toBe("777ABC02");
    expect(normalizePlate("demo-001")).toBe("DEMO-001");
  });
});

describe("KZ plate parsing", () => {
  it("matches the 3-digit / 2–3-letter / 2-digit standard", () => {
    expect(KZ_PLATE_PATTERN.test("777ABC02")).toBe(true);
    expect(KZ_PLATE_PATTERN.test("123XYZ05")).toBe(true); // 3-letter body
    expect(KZ_PLATE_PATTERN.test("123AB05")).toBe(true); // 2-letter body
  });

  it("splits a matching plate into body + region segments", () => {
    const { format, segments } = resolvePlate("777ABC02", "KZ");
    expect(format?.country).toBe("KZ");
    expect(segments).toEqual({ kind: "kz", body: "777 ABC", region: "02" });
  });

  it("is case- and space-insensitive", () => {
    const { format, segments } = resolvePlate("777 abc 02", "KZ");
    expect(format?.country).toBe("KZ");
    expect(segments).toEqual({ kind: "kz", body: "777 ABC", region: "02" });
  });

  it("ignores the country's letter case", () => {
    expect(resolvePlate("123XYZ05", "kz").segments.kind).toBe("kz");
  });
});

describe("generic fallback", () => {
  it("renders generic chrome for a non-matching plate in a KZ wash", () => {
    const { format, segments } = resolvePlate("DEMO-001", "KZ");
    expect(format).toBeNull();
    expect(segments).toEqual({ kind: "plain", text: "DEMO-001" });
  });

  it("falls back when the car wash has no country", () => {
    expect(resolvePlate("777ABC02", null).format).toBeNull();
    expect(resolvePlate("777ABC02", undefined).format).toBeNull();
  });

  it("falls back for an unregistered country (RU/IL stubs route to generic)", () => {
    expect(resolvePlate("777ABC02", "RU").format).toBeNull();
    expect(resolvePlate("777ABC02", "IL").format).toBeNull();
  });
});
