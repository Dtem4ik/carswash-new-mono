import { describe, expect, it } from "vitest";
import {
  formatMinorToInput,
  indexPrices,
  isCellDirty,
  type PriceCell,
  parseAmountToMinor,
  priceKey,
} from "./price-matrix";

// KZT: 2 fraction digits → 100 minor units per major unit.
const KZT = 100;
// JPY: 0 fraction digits → 1 minor unit per major unit.
const JPY = 1;

describe("priceKey", () => {
  it("joins row and column ids", () => {
    expect(priceKey("svc", "ct")).toBe("svc:ct");
  });
});

describe("indexPrices", () => {
  it("maps each cell key to its amount", () => {
    const cells: PriceCell[] = [
      { rowId: "s1", carTypeId: "c1", amountMinor: 5000 },
      { rowId: "s1", carTypeId: "c2", amountMinor: 7000 },
      { rowId: "s2", carTypeId: "c1", amountMinor: 9000 },
    ];
    const map = indexPrices(cells);
    expect(map.get(priceKey("s1", "c1"))).toBe(5000);
    expect(map.get(priceKey("s1", "c2"))).toBe(7000);
    expect(map.get(priceKey("s2", "c1"))).toBe(9000);
    expect(map.has(priceKey("s2", "c2"))).toBe(false);
  });

  it("is empty for no rows", () => {
    expect(indexPrices([]).size).toBe(0);
  });
});

describe("parseAmountToMinor", () => {
  it("returns null for an empty or blank string", () => {
    expect(parseAmountToMinor("", KZT)).toBeNull();
    expect(parseAmountToMinor("   ", KZT)).toBeNull();
  });

  it("scales major units by the currency factor", () => {
    expect(parseAmountToMinor("500", KZT)).toBe(50000);
    expect(parseAmountToMinor("500", JPY)).toBe(500);
  });

  it("rounds fractional major units to whole minor units", () => {
    expect(parseAmountToMinor("12.34", KZT)).toBe(1234);
    expect(parseAmountToMinor("12.345", KZT)).toBe(1235); // rounds .5 up
  });

  it("accepts a real zero (distinct from empty)", () => {
    expect(parseAmountToMinor("0", KZT)).toBe(0);
  });

  it("rejects negative or non-numeric input", () => {
    expect(parseAmountToMinor("-5", KZT)).toBeNull();
    expect(parseAmountToMinor("abc", KZT)).toBeNull();
  });
});

describe("formatMinorToInput", () => {
  it("renders saved minor units as a major-unit string", () => {
    expect(formatMinorToInput(50000, KZT)).toBe("500");
    expect(formatMinorToInput(1234, KZT)).toBe("12.34");
    expect(formatMinorToInput(500, JPY)).toBe("500");
  });

  it("renders an unset price as an empty string", () => {
    expect(formatMinorToInput(undefined, KZT)).toBe("");
  });

  it("renders a saved zero as '0', not empty", () => {
    expect(formatMinorToInput(0, KZT)).toBe("0");
  });
});

describe("isCellDirty", () => {
  it("is dirty when the parsed draft differs from the saved value", () => {
    expect(isCellDirty("600", 50000, KZT)).toBe(true); // 60000 ≠ 50000
  });

  it("is not dirty when the draft equals the saved value", () => {
    expect(isCellDirty("500", 50000, KZT)).toBe(false);
  });

  it("is not dirty for an empty or invalid draft (nothing to save)", () => {
    expect(isCellDirty("", 50000, KZT)).toBe(false);
    expect(isCellDirty("abc", undefined, KZT)).toBe(false);
  });

  it("is dirty when setting a first price on an unpriced cell", () => {
    expect(isCellDirty("500", undefined, KZT)).toBe(true);
  });

  it("treats a typed 0 against an unset cell as dirty", () => {
    expect(isCellDirty("0", undefined, KZT)).toBe(true);
  });
});
