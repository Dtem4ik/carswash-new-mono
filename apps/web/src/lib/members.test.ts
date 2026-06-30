import { describe, expect, it } from "vitest";
import { canManageMember, isLocationRole } from "@/lib/members";

describe("isLocationRole", () => {
  it("classifies org-level vs car-wash-scoped roles", () => {
    expect(isLocationRole("owner")).toBe(false);
    expect(isLocationRole("org_admin")).toBe(false);
    expect(isLocationRole("manager")).toBe(true);
    expect(isLocationRole("washer")).toBe(true);
  });
});

describe("canManageMember", () => {
  const washerHere = {
    role: "washer" as const,
    car_wash_id: "cw-1",
    user_id: "u-w",
  };
  const washerThere = {
    role: "washer" as const,
    car_wash_id: "cw-2",
    user_id: "u-w2",
  };
  const otherManager = {
    role: "manager" as const,
    car_wash_id: "cw-1",
    user_id: "u-m2",
  };

  it("lets an org_admin manage anyone but themselves", () => {
    expect(
      canManageMember({
        callerRole: "org_admin",
        callerCarWashId: null,
        member: washerThere,
        selfUserId: "u-admin",
      }),
    ).toBe(true);
  });

  it("never lets you manage your own seat", () => {
    expect(
      canManageMember({
        callerRole: "owner",
        callerCarWashId: null,
        member: { role: "owner", car_wash_id: null, user_id: "u-self" },
        selfUserId: "u-self",
      }),
    ).toBe(false);
  });

  it("lets a manager manage only washers at their own car wash", () => {
    const base = {
      callerRole: "manager" as const,
      callerCarWashId: "cw-1",
      selfUserId: "u-m",
    };
    expect(canManageMember({ ...base, member: washerHere })).toBe(true);
    expect(canManageMember({ ...base, member: washerThere })).toBe(false); // other wash
    expect(canManageMember({ ...base, member: otherManager })).toBe(false); // not a washer
  });

  it("denies a washer entirely", () => {
    expect(
      canManageMember({
        callerRole: "washer",
        callerCarWashId: "cw-1",
        member: washerHere,
        selfUserId: "u-x",
      }),
    ).toBe(false);
  });
});
