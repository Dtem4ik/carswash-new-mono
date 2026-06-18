import { getTranslations } from "next-intl/server";
import { ShiftControl } from "@/components/shifts/shift-control";

export default async function ShiftPage() {
  const t = await getTranslations("shift");
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>
      <ShiftControl />
    </div>
  );
}
