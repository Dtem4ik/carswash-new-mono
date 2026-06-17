"use server";

import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { ACTIVE_CAR_WASH_COOKIE } from "@/lib/api";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Persist the operator's active car wash; the server reads it on the next render. */
export async function setActiveCarWash(carWashId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_CAR_WASH_COOKIE, carWashId, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
  });
}

/** Persist the operator's UI language; next-intl reads it on the next request. */
export async function setLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
  });
}
