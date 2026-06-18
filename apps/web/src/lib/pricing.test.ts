import { describe, expect, it } from "vitest";
import {
  computeOrderPreview,
  packagePriceMap,
  servicePriceMap,
} from "./pricing";

const SEDAN = "ct-sedan";
const SUV = "ct-suv";
const WASH = "svc-wash";
const WAX = "svc-wax";
const PKG = "pkg-full";

const servicePrices = [
  {
    id: "1",
    car_wash_id: "cw",
    service_id: WASH,
    car_type_id: SEDAN,
    amount_minor: 30000,
  },
  {
    id: "2",
    car_wash_id: "cw",
    service_id: WAX,
    car_type_id: SEDAN,
    amount_minor: 20000,
  },
  {
    id: "3",
    car_wash_id: "cw",
    service_id: WASH,
    car_type_id: SUV,
    amount_minor: 40000,
  },
];

const packagePrices = [
  {
    id: "p1",
    car_wash_id: "cw",
    package_id: PKG,
    car_type_id: SEDAN,
    amount_minor: 45000,
  },
];

describe("servicePriceMap", () => {
  it("keeps only prices for the selected car type", () => {
    const map = servicePriceMap(servicePrices, SEDAN);
    expect(map.get(WASH)).toBe(30000);
    expect(map.get(WAX)).toBe(20000);
    expect(map.size).toBe(2);
  });

  it("is empty when no car type is selected", () => {
    expect(servicePriceMap(servicePrices, null).size).toBe(0);
  });

  it("reflects a different car type's prices", () => {
    const map = servicePriceMap(servicePrices, SUV);
    expect(map.get(WASH)).toBe(40000);
    expect(map.has(WAX)).toBe(false);
  });
});

describe("computeOrderPreview", () => {
  const sedanServices = servicePriceMap(servicePrices, SEDAN);
  const sedanPackages = packagePriceMap(packagePrices, SEDAN);

  it("sums service unit prices times quantity", () => {
    const preview = computeOrderPreview({
      services: [
        { serviceId: WASH, qty: 2 },
        { serviceId: WAX, qty: 1 },
      ],
      packageId: null,
      servicePrices: sedanServices,
      packagePrices: sedanPackages,
      discountMinor: 0,
    });
    expect(preview.subtotalMinor).toBe(80000); // 30000*2 + 20000
    expect(preview.totalMinor).toBe(80000);
  });

  it("adds the package price to the subtotal", () => {
    const preview = computeOrderPreview({
      services: [{ serviceId: WASH, qty: 1 }],
      packageId: PKG,
      servicePrices: sedanServices,
      packagePrices: sedanPackages,
      discountMinor: 0,
    });
    expect(preview.subtotalMinor).toBe(75000); // 30000 + 45000
  });

  it("subtracts the discount from the total", () => {
    const preview = computeOrderPreview({
      services: [{ serviceId: WASH, qty: 1 }],
      packageId: null,
      servicePrices: sedanServices,
      packagePrices: sedanPackages,
      discountMinor: 5000,
    });
    expect(preview.discountMinor).toBe(5000);
    expect(preview.totalMinor).toBe(25000);
  });

  it("clamps a discount that exceeds the subtotal", () => {
    const preview = computeOrderPreview({
      services: [{ serviceId: WASH, qty: 1 }],
      packageId: null,
      servicePrices: sedanServices,
      packagePrices: sedanPackages,
      discountMinor: 999999,
    });
    expect(preview.discountMinor).toBe(30000);
    expect(preview.totalMinor).toBe(0);
  });

  it("ignores unknown / unpriced services and zero quantities", () => {
    const preview = computeOrderPreview({
      services: [
        { serviceId: "unknown", qty: 3 },
        { serviceId: WASH, qty: 0 },
      ],
      packageId: null,
      servicePrices: sedanServices,
      packagePrices: sedanPackages,
      discountMinor: 0,
    });
    expect(preview.subtotalMinor).toBe(0);
  });
});
