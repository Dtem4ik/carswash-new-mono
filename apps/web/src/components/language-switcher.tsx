"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type Locale, localeLabels, locales } from "@/i18n/config";
import { setLocale } from "@/lib/actions";

/** Switches the UI language; the choice is persisted in a cookie via a server action. */
export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onValueChange(next: string | null) {
    if (next == null) return;
    startTransition(async () => {
      await setLocale(next as Locale);
      router.refresh();
    });
  }

  return (
    <Select value={locale} onValueChange={onValueChange} disabled={pending}>
      <SelectTrigger className="h-9" aria-label={t("language")}>
        <Languages
          size={16}
          aria-hidden="true"
          className="text-muted-foreground"
        />
        <SelectValue>{(value) => localeLabels[value as Locale]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {locales.map((value) => (
          <SelectItem key={value} value={value}>
            {localeLabels[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
