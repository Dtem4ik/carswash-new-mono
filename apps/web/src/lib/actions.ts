"use server";

import { cookies } from "next/headers";
import { ACTIVE_CAR_WASH_COOKIE } from "@/lib/api";

/** Persist the operator's active car wash; the server reads it on the next render. */
export async function setActiveCarWash(carWashId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_CAR_WASH_COOKIE, carWashId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
