import type { components, Role } from "@carswash/shared";

/**
 * Pure staff/role rules shared by the Admin → Staff UI and unit-tested. They
 * mirror the backend authorization in `app/api/members.py`: org-level roles are
 * never car-wash-scoped, and a manager may act only on washers at their own car
 * wash (and never on themselves).
 */

type Member = components["schemas"]["MemberOut"];

/** owner/org_admin are organization-level; manager/washer are car-wash-scoped. */
export function isLocationRole(role: Role): boolean {
  return role === "manager" || role === "washer";
}

/** Whether the caller may edit/remove this member's seat from the UI. */
export function canManageMember(args: {
  callerRole: Role;
  callerCarWashId: string | null;
  member: Pick<Member, "role" | "car_wash_id" | "user_id">;
  selfUserId: string;
}): boolean {
  const { callerRole, callerCarWashId, member, selfUserId } = args;
  // Never manage your own seat (the backend also forbids removing it).
  if (member.user_id === selfUserId) return false;
  if (callerRole === "owner" || callerRole === "org_admin") return true;
  if (callerRole === "manager") {
    return member.role === "washer" && member.car_wash_id === callerCarWashId;
  }
  return false; // washer: no staff management
}
