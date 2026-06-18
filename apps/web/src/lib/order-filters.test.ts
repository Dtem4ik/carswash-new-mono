import { describe, expect, it } from "vitest";
import {
  buildOrderListParams,
  nextCalendarDay,
  type OrderFilters,
  zonedDayStartUtc,
} from "./order-filters";

const ALMATY = "Asia/Almaty"; // UTC+5, no DST

const base: OrderFilters = {
  status: "",
  boxId: "",
  from: "",
  to: "",
  page: 0,
  pageSize: 20,
};

describe("zonedDayStartUtc", () => {
  it("resolves local midnight to the right UTC instant (UTC+5)", () => {
    // 2026-06-18 00:00 in Almaty (UTC+5) is 2026-06-17 19:00 UTC.
    expect(zonedDayStartUtc("2026-06-18", ALMATY)).toBe(
      "2026-06-17T19:00:00.000Z",
    );
  });

  it("is identity for UTC", () => {
    expect(zonedDayStartUtc("2026-06-18", "UTC")).toBe(
      "2026-06-18T00:00:00.000Z",
    );
  });
});

describe("nextCalendarDay", () => {
  it("advances one day, rolling month boundaries", () => {
    expect(nextCalendarDay("2026-06-30")).toBe("2026-07-01");
  });
});

describe("buildOrderListParams", () => {
  it("maps pagination to limit/offset", () => {
    const q = buildOrderListParams({ ...base, page: 2, pageSize: 20 }, ALMATY);
    expect(q.limit).toBe(20);
    expect(q.offset).toBe(40);
  });

  it("omits empty filters", () => {
    const q = buildOrderListParams(base, ALMATY);
    expect(q.status).toBeUndefined();
    expect(q.box_id).toBeUndefined();
    expect(q.created_from).toBeUndefined();
    expect(q.created_to).toBeUndefined();
  });

  it("passes status and box through", () => {
    const q = buildOrderListParams(
      { ...base, status: "done", boxId: "box-1" },
      ALMATY,
    );
    expect(q.status).toBe("done");
    expect(q.box_id).toBe("box-1");
  });

  it("converts the date range to wash-timezone UTC, end-exclusive", () => {
    const q = buildOrderListParams(
      { ...base, from: "2026-06-18", to: "2026-06-18" },
      ALMATY,
    );
    expect(q.created_from).toBe("2026-06-17T19:00:00.000Z");
    // `to` is inclusive of the whole day → next day's start in UTC.
    expect(q.created_to).toBe("2026-06-18T19:00:00.000Z");
  });
});
