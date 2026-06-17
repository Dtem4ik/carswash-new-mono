/**
 * i18n configuration. We use next-intl WITHOUT locale-prefixed routing: the
 * active locale is persisted in a cookie and resolved per request. Adding a new
 * locale is a matter of adding a `messages/<locale>.json` file and listing it
 * here — no routing or code changes.
 */

export const locales = ["ru", "en", "kk"] as const;

export type Locale = (typeof locales)[number];

/** Russian is the default for the MVP operator audience. */
export const defaultLocale: Locale = "ru";

/** Cookie that persists the operator's chosen UI language. */
export const LOCALE_COOKIE = "cw_locale";

/** Native display label for each locale (shown in the language switcher). */
export const localeLabels: Record<Locale, string> = {
  ru: "Русский",
  en: "English",
  kk: "Қазақша",
};

export function isLocale(value: string | undefined | null): value is Locale {
  return value != null && (locales as readonly string[]).includes(value);
}
