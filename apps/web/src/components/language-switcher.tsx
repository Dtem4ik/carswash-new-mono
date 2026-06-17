"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { type Locale, localeLabels, locales } from "@/i18n/config";
import { setLocale } from "@/lib/actions";

/** Switches the UI language; the choice is persisted in a cookie via a server action. */
export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as Locale;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <label className="relative flex items-center">
      <Languages
        size={16}
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute left-2.5"
      />
      <span className="sr-only">{t("language")}</span>
      <select
        value={locale}
        onChange={onChange}
        disabled={pending}
        className="border-input bg-background hover:bg-muted focus-visible:ring-ring h-9 cursor-pointer rounded-md border pr-3 pl-8 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
      >
        {locales.map((value) => (
          <option key={value} value={value}>
            {localeLabels[value]}
          </option>
        ))}
      </select>
    </label>
  );
}
