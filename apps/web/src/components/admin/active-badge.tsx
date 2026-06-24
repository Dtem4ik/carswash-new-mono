"use client";

import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/status-badge";

/** Active (green) / Archived (slate) pill for catalog + box rows. */
export function ActiveBadge({ isActive }: { isActive: boolean }) {
  const t = useTranslations("admin");
  return (
    <StatusBadge
      tone={isActive ? "free" : "done"}
      label={isActive ? t("statusActive") : t("statusArchived")}
    />
  );
}
