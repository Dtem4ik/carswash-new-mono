"use client";

import { useLocale } from "next-intl";
import { useMemo } from "react";

/**
 * Money & time formatting. All values are canonical (integer minor units + ISO
 * currency; UTC ISO timestamps) and localized only here, at the edge:
 *   - money via Intl.NumberFormat with the ACTIVE car wash's currency
 *   - time via Intl.DateTimeFormat with the ACTIVE car wash's IANA timezone
 * Kept as pure functions so they are trivially unit-testable.
 */

/**
 * Format integer minor units as currency. The minor-unit scale is derived from
 * the currency itself (via Intl's resolved fraction digits), so JPY (0), KZT (2)
 * and BHD (3) all render correctly without a hard-coded divisor.
 */
export function formatMoney(
  amountMinor: number,
  currency: string,
  locale: string,
): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(amountMinor / 10 ** fractionDigits);
}

/**
 * The number of minor units in one major unit of `currency` (e.g. 100 for KZT,
 * 1 for JPY, 1000 for BHD), derived from Intl's resolved fraction digits. Lets
 * the UI accept a discount in major units and convert it to the canonical minor
 * units the API expects, without a hard-coded divisor.
 */
export function currencyMinorFactor(currency: string, locale: string): number {
  const fractionDigits = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).resolvedOptions().maximumFractionDigits;
  return 10 ** (fractionDigits ?? 2);
}

/** Format a UTC ISO timestamp in the given IANA timezone. */
export function formatDateTime(
  iso: string,
  timeZone: string,
  locale: string,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(
    new Date(iso),
  );
}

/** Format a UTC ISO timestamp as time-of-day only, in the given IANA timezone. */
export function formatTime(
  iso: string,
  timeZone: string,
  locale: string,
): string {
  return formatDateTime(iso, timeZone, locale, { timeStyle: "short" });
}

/**
 * Client hook that binds the formatters to the active UI locale. Currency and
 * timezone come from the active car wash and are passed in by the caller.
 */
export function useFormatters() {
  const locale = useLocale();
  return useMemo(
    () => ({
      money: (amountMinor: number, currency: string) =>
        formatMoney(amountMinor, currency, locale),
      dateTime: (iso: string, timeZone: string) =>
        formatDateTime(iso, timeZone, locale),
      time: (iso: string, timeZone: string) =>
        formatTime(iso, timeZone, locale),
      minorFactor: (currency: string) => currencyMinorFactor(currency, locale),
    }),
    [locale],
  );
}
