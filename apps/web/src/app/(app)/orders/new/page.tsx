import { getTranslations } from "next-intl/server";
import { OrderIntakeForm } from "@/components/orders/order-intake-form";

export default async function NewOrderPage() {
  const t = await getTranslations("intake");
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>
      <OrderIntakeForm />
    </div>
  );
}
