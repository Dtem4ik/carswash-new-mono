import type { components } from "@carswash/shared";

/**
 * Client-side price preview for order intake. The server stays authoritative on
 * submit (it re-prices from the same matrix); this only mirrors that math so the
 * operator sees a live subtotal / discount / total while composing the order.
 * Pure + framework-free so it is trivially unit-tested.
 */

type ServicePrice = components["schemas"]["ServicePriceOut"];
type PackagePrice = components["schemas"]["PackagePriceOut"];

export interface ServiceSelection {
  serviceId: string;
  qty: number;
}

export interface OrderPreview {
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
}

/** Service id → unit price (minor units) for a single car type. */
export function servicePriceMap(
  prices: ServicePrice[],
  carTypeId: string | null,
): Map<string, number> {
  const map = new Map<string, number>();
  if (!carTypeId) return map;
  for (const p of prices) {
    if (p.car_type_id === carTypeId) map.set(p.service_id, p.amount_minor);
  }
  return map;
}

/** Package id → price (minor units) for a single car type. */
export function packagePriceMap(
  prices: PackagePrice[],
  carTypeId: string | null,
): Map<string, number> {
  const map = new Map<string, number>();
  if (!carTypeId) return map;
  for (const p of prices) {
    if (p.car_type_id === carTypeId) map.set(p.package_id, p.amount_minor);
  }
  return map;
}

/**
 * Subtotal = Σ(service unit × qty) + package price; the discount is clamped to
 * the subtotal (the server rejects a discount that exceeds it). Unknown
 * service/package ids contribute nothing — the UI only offers priced items.
 */
export function computeOrderPreview(params: {
  services: ServiceSelection[];
  packageId: string | null;
  servicePrices: Map<string, number>;
  packagePrices: Map<string, number>;
  discountMinor: number;
}): OrderPreview {
  let subtotalMinor = 0;
  for (const { serviceId, qty } of params.services) {
    const unit = params.servicePrices.get(serviceId);
    if (unit != null && qty > 0) subtotalMinor += unit * qty;
  }
  if (params.packageId) {
    const pkg = params.packagePrices.get(params.packageId);
    if (pkg != null) subtotalMinor += pkg;
  }
  const discountMinor = Math.max(
    0,
    Math.min(params.discountMinor || 0, subtotalMinor),
  );
  return {
    subtotalMinor,
    discountMinor,
    totalMinor: subtotalMinor - discountMinor,
  };
}
