import { getTranslations } from "next-intl/server";

// Placeholder landing; the live boxes board is wired up later in Phase 4a.
export default async function BoardPage() {
  const t = await getTranslations("board");
  return (
    <div className="space-y-1">
      <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
    </div>
  );
}
