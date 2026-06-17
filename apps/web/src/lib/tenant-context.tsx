"use client";

import type { CarWash, MeResponse, Role } from "@carswash/shared";
import { createContext, type ReactNode, useContext, useMemo } from "react";

interface TenantValue {
  me: MeResponse;
  /** The car wash currently being operated on; drives money/time formatting. */
  activeCarWash: CarWash | null;
  role: Role;
  capabilities: string[];
  userEmail: string | null;
  hasCapability: (capability: string) => boolean;
}

const TenantContext = createContext<TenantValue | null>(null);

/** Provides the resolved tenant context (org, active car wash, role) to the tree. */
export function TenantProvider({
  me,
  userEmail,
  children,
}: {
  me: MeResponse;
  userEmail: string | null;
  children: ReactNode;
}) {
  const value = useMemo<TenantValue>(() => {
    const activeCarWash =
      me.accessible_car_washes.find((cw) => cw.id === me.active_car_wash_id) ??
      me.accessible_car_washes[0] ??
      null;
    return {
      me,
      activeCarWash,
      role: me.role,
      capabilities: me.capabilities,
      userEmail,
      hasCapability: (capability) => me.capabilities.includes(capability),
    };
  }, [me, userEmail]);

  return <TenantContext value={value}>{children}</TenantContext>;
}

export function useTenant(): TenantValue {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return context;
}
