import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import kk from "../../messages/kk.json";
import ru from "../../messages/ru.json";

const catalogs = { en, ru, kk } as const;

type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

function leafPaths(value: Json, prefix = ""): string[] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, child]) =>
      leafPaths(child as Json, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

describe("message catalog parity", () => {
  it("ru and kk have exactly the same keys as en", () => {
    const enKeys = leafPaths(en as Json).sort();
    for (const locale of ["ru", "kk"] as const) {
      const keys = leafPaths(catalogs[locale] as Json).sort();
      expect(keys, `locale ${locale}`).toEqual(enKeys);
    }
  });

  it("no message is empty in any locale", () => {
    for (const [locale, catalog] of Object.entries(catalogs)) {
      const obj = catalog as unknown as Record<string, unknown>;
      for (const path of leafPaths(catalog as Json)) {
        const value = path
          .split(".")
          // biome-ignore lint/suspicious/noExplicitAny: walking dynamic JSON
          .reduce<any>((acc, key) => acc[key], obj);
        expect(typeof value, `${locale}:${path}`).toBe("string");
        expect((value as string).length, `${locale}:${path}`).toBeGreaterThan(
          0,
        );
      }
    }
  });
});

describe("code → label coverage", () => {
  const ORDER_STATUSES = ["queued", "in_progress", "done", "cancelled"];
  const BOX_STATUSES = ["free", "busy"];
  const PAYMENT_STATUSES = ["unpaid", "partial", "paid", "credit", "refunded"];
  const ERROR_CODES = [
    "unknown",
    "not_found",
    "auth.forbidden",
    "tenant.car_wash_required",
    "shift.not_open",
    "order.empty",
    "discount.exceeds_subtotal",
    "pricing.missing",
  ];

  for (const [locale, catalog] of Object.entries(catalogs)) {
    const c = catalog as unknown as Record<string, Record<string, string>>;

    it(`${locale} labels every order/box/payment status`, () => {
      for (const code of ORDER_STATUSES)
        expect(c.orderStatus[code]).toBeTruthy();
      for (const code of BOX_STATUSES) expect(c.boxStatus[code]).toBeTruthy();
      for (const code of PAYMENT_STATUSES)
        expect(c.paymentStatus[code]).toBeTruthy();
    });

    it(`${locale} labels every known error code`, () => {
      const errors = c.errors as unknown as Record<string, unknown>;
      for (const code of ERROR_CODES) {
        const value = code
          .split(".")
          // biome-ignore lint/suspicious/noExplicitAny: walking dynamic JSON
          .reduce<any>((acc, key) => acc?.[key], errors);
        expect(typeof value, `${locale}:errors.${code}`).toBe("string");
      }
    });
  }
});
