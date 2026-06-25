import { describe, expect, it } from "vitest";
import {
  applyActiveOrder,
  boxBusyFromList,
  buildOptimisticOrder,
  closeOrCancelOrder,
  detailToOrderOut,
  isOptimisticId,
  mergeRealtimeOrder,
  type OptimisticOrderInput,
  type OrderDetailOut,
  type OrderOut,
  type PaymentOut,
  recordPaymentOnDetail,
  removeActiveOrder,
  syncBoxStatus,
} from "@/lib/order-cache";

const NOW = "2026-06-25T10:00:00.000Z";

function order(over: Partial<OrderOut> = {}): OrderOut {
  return {
    box_id: "box-1",
    car_brand: null,
    car_model: null,
    car_type_id: "ct-1",
    car_wash_id: "cw-1",
    client_car_id: null,
    client_name: null,
    client_phone: null,
    created_at: NOW,
    created_by: "u-1",
    currency: "KZT",
    discount_amount_minor: 0,
    discount_type: "none",
    finished_at: null,
    finished_by: null,
    id: "o-1",
    number: 1,
    package_id: null,
    payment_status: "unpaid",
    plate: "777ABC02",
    shift_id: "s-1",
    started_at: NOW,
    status: "in_progress",
    subtotal_minor: 5000,
    total_minor: 5000,
    washers: [],
    ...over,
  };
}

describe("applyActiveOrder", () => {
  it("upserts an active order by id", () => {
    const list = [order({ id: "o-1", total_minor: 5000 })];
    const next = applyActiveOrder(
      list,
      order({ id: "o-1", total_minor: 9000 }),
    );
    expect(next).toHaveLength(1);
    expect(next[0].total_minor).toBe(9000);
  });

  it("drops an order that left the active statuses (done/cancelled)", () => {
    const list = [order({ id: "o-1" }), order({ id: "o-2", status: "queued" })];
    expect(
      applyActiveOrder(list, order({ id: "o-1", status: "done" })),
    ).toEqual([list[1]]);
    expect(
      applyActiveOrder(list, order({ id: "o-2", status: "cancelled" })),
    ).toEqual([list[0]]);
  });

  it("adds a new active order", () => {
    expect(applyActiveOrder([], order({ id: "new" }))).toHaveLength(1);
  });
});

describe("removeActiveOrder", () => {
  it("removes by id", () => {
    const list = [order({ id: "a" }), order({ id: "b" })];
    expect(removeActiveOrder(list, "a")).toEqual([list[1]]);
  });
});

describe("closeOrCancelOrder", () => {
  it("removes an in_progress order and promotes the oldest queued on its box", () => {
    const list = [
      order({ id: "active", status: "in_progress", number: 1 }),
      order({ id: "q2", status: "queued", number: 3, started_at: null }),
      order({ id: "q1", status: "queued", number: 2, started_at: null }),
    ];
    const next = closeOrCancelOrder(list, "active", NOW);
    expect(next.find((o) => o.id === "active")).toBeUndefined();
    const promoted = next.find((o) => o.id === "q1");
    expect(promoted?.status).toBe("in_progress");
    expect(promoted?.started_at).toBe(NOW);
    // The later-numbered queued order stays queued.
    expect(next.find((o) => o.id === "q2")?.status).toBe("queued");
  });

  it("removes a queued order without promoting anything", () => {
    const list = [
      order({ id: "active", status: "in_progress" }),
      order({ id: "q1", status: "queued", started_at: null }),
    ];
    const next = closeOrCancelOrder(list, "q1", NOW);
    expect(next.map((o) => o.id)).toEqual(["active"]);
    expect(next[0].status).toBe("in_progress");
  });

  it("frees a box with no queue when its active order closes", () => {
    const list = [order({ id: "active", box_id: "box-1" })];
    const next = closeOrCancelOrder(list, "active", NOW);
    expect(next).toHaveLength(0);
    expect(boxBusyFromList(next, "box-1")).toBe(false);
  });
});

describe("mergeRealtimeOrder (de-dupe by id)", () => {
  it("overlays scalars onto a known order without duplicating it", () => {
    const list = [
      order({
        id: "o-1",
        payment_status: "unpaid",
        washers: [{ user_id: "w", name: "Ann" }],
      }),
    ];
    const { list: next, handled } = mergeRealtimeOrder(list, {
      id: "o-1",
      box_id: "box-1",
      status: "in_progress",
      payment_status: "paid",
      total_minor: 5000,
      plate: "777ABC02",
      number: 1,
      started_at: NOW,
      finished_at: null,
    });
    expect(handled).toBe(true);
    expect(next).toHaveLength(1);
    expect(next[0].payment_status).toBe("paid");
    // Joined fields not present in the raw row are preserved.
    expect(next[0].washers).toEqual([{ user_id: "w", name: "Ann" }]);
  });

  it("drops a known order when it transitions out of active statuses", () => {
    const list = [order({ id: "o-1" })];
    const { list: next } = mergeRealtimeOrder(list, {
      id: "o-1",
      box_id: "box-1",
      status: "done",
      payment_status: "paid",
      total_minor: 5000,
      plate: null,
      number: 1,
      started_at: NOW,
      finished_at: NOW,
    });
    expect(next).toHaveLength(0);
  });

  it("reports an unknown order as unhandled so the caller can reconcile", () => {
    const { list: next, handled } = mergeRealtimeOrder([], {
      id: "x",
      box_id: "box-1",
      status: "in_progress",
      payment_status: "unpaid",
      total_minor: 0,
      plate: null,
      number: 9,
      started_at: NOW,
      finished_at: null,
    });
    expect(handled).toBe(false);
    expect(next).toHaveLength(0);
  });
});

describe("box status helpers", () => {
  const boxes = [
    {
      id: "box-1",
      car_wash_id: "cw-1",
      is_active: true,
      name: "1",
      sort: 0,
      status: "free" as const,
      active_order_id: null,
    },
    {
      id: "box-2",
      car_wash_id: "cw-1",
      is_active: true,
      name: "2",
      sort: 1,
      status: "busy" as const,
      active_order_id: null,
    },
  ];

  it("marks a box busy when it has an in_progress order, free otherwise", () => {
    const list = [order({ id: "o", box_id: "box-1", status: "in_progress" })];
    expect(syncBoxStatus(boxes, list, "box-1")[0].status).toBe("busy");
    expect(syncBoxStatus(boxes, [], "box-2")[1].status).toBe("free");
  });

  it("a box with only a queued order is not busy", () => {
    const list = [order({ id: "o", box_id: "box-1", status: "queued" })];
    expect(boxBusyFromList(list, "box-1")).toBe(false);
  });
});

describe("buildOptimisticOrder", () => {
  const base: OptimisticOrderInput = {
    id: "optimistic-1",
    boxId: "box-1",
    carWashId: "cw-1",
    carTypeId: "ct-1",
    plate: "777ABC02",
    clientName: "Ann",
    clientPhone: "+7700",
    totalMinor: 4500,
    subtotalMinor: 5000,
    discountMinor: 500,
    currency: "KZT",
    boxFree: true,
    corporate: false,
    washers: [{ user_id: "w", name: "Bob" }],
    nowIso: NOW,
  };

  it("starts an order on a free box (in_progress + started_at)", () => {
    const o = buildOptimisticOrder(base);
    expect(o.status).toBe("in_progress");
    expect(o.started_at).toBe(NOW);
    expect(o.payment_status).toBe("unpaid");
    expect(o.total_minor).toBe(4500);
  });

  it("queues an order on a busy box (no started_at)", () => {
    const o = buildOptimisticOrder({ ...base, boxFree: false });
    expect(o.status).toBe("queued");
    expect(o.started_at).toBeNull();
  });

  it("a corporate client washes on credit", () => {
    expect(
      buildOptimisticOrder({ ...base, corporate: true }).payment_status,
    ).toBe("credit");
  });
});

describe("isOptimisticId", () => {
  it("recognizes the optimistic prefix", () => {
    expect(isOptimisticId("optimistic-abc")).toBe(true);
    expect(isOptimisticId("real-id")).toBe(false);
  });
});

function detail(over: Partial<OrderDetailOut> = {}): OrderDetailOut {
  return {
    balance_minor: 5000,
    box_id: "box-1",
    car_brand: null,
    car_model: null,
    car_type_id: "ct-1",
    car_wash_id: "cw-1",
    client_car_id: null,
    client_name: null,
    client_phone: null,
    created_at: NOW,
    created_by: "u-1",
    currency: "KZT",
    discount_amount_minor: 0,
    discount_type: "none",
    finished_at: null,
    finished_by: null,
    id: "o-1",
    number: 1,
    package_id: null,
    paid_total_minor: 0,
    payment_status: "unpaid",
    payments: [],
    plate: "777ABC02",
    services: [],
    shift_id: "s-1",
    started_at: NOW,
    status: "in_progress",
    subtotal_minor: 5000,
    total_minor: 5000,
    washers: [],
    ...over,
  };
}

function payment(over: Partial<PaymentOut> = {}): PaymentOut {
  return {
    id: "p-1",
    amount_minor: 5000,
    currency: "KZT",
    kind: "payment",
    method: "cash",
    paid_at: NOW,
    received_by: null,
    ...over,
  };
}

describe("recordPaymentOnDetail", () => {
  it("flips an order to paid when fully covered", () => {
    const next = recordPaymentOnDetail(
      detail(),
      payment({ amount_minor: 5000 }),
    );
    expect(next.paid_total_minor).toBe(5000);
    expect(next.balance_minor).toBe(0);
    expect(next.payment_status).toBe("paid");
    expect(next.payments).toHaveLength(1);
  });

  it("marks a partial payment", () => {
    const next = recordPaymentOnDetail(
      detail(),
      payment({ amount_minor: 2000 }),
    );
    expect(next.payment_status).toBe("partial");
    expect(next.balance_minor).toBe(3000);
  });

  it("nets a refund back out and marks refunded", () => {
    const paid = recordPaymentOnDetail(
      detail(),
      payment({ amount_minor: 5000 }),
    );
    const refunded = recordPaymentOnDetail(
      paid,
      payment({ id: "p-2", amount_minor: 5000, kind: "refund" }),
    );
    expect(refunded.paid_total_minor).toBe(0);
    expect(refunded.payment_status).toBe("refunded");
  });

  it("keeps a corporate order on credit when unpaid", () => {
    const next = recordPaymentOnDetail(
      detail({ payment_status: "credit" }),
      payment({ amount_minor: 0 }),
    );
    expect(next.payment_status).toBe("credit");
  });
});

describe("detailToOrderOut", () => {
  it("projects the detail down to the board row shape", () => {
    const o = detailToOrderOut(
      detail({
        washers: [
          {
            user_id: "w",
            name: "Ann",
            share_bps: 10000,
            earned_amount_minor: 0,
          },
        ],
      }),
    );
    expect(o.id).toBe("o-1");
    expect(o.washers).toEqual([{ user_id: "w", name: "Ann" }]);
    expect("paid_total_minor" in o).toBe(false);
  });
});
