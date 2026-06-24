/**
 * The admin (settings) section is reachable by anyone who can manage pricing,
 * boxes, or the catalog — i.e. manager / org_admin / owner. A washer holds none
 * of these and is kept out (the nav item hides; the route shows a no-access
 * message). Capabilities are the same stable codes the API gates writes on.
 */
export const ADMIN_CAPABILITIES = [
  "pricing.edit",
  "boxes.manage",
  "catalog.manage",
] as const;

/** Whether the current role may enter the admin section at all. */
export function hasAdminAccess(
  hasCapability: (capability: string) => boolean,
): boolean {
  return ADMIN_CAPABILITIES.some(hasCapability);
}
