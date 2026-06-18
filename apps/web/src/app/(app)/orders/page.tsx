import { getTranslations } from "next-intl/server";
import { OrdersTable } from "@/components/orders/orders-table";

export default async function OrdersPage() {
  const t = await getTranslations("orders");
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>
      <OrdersTable />
    </div>
  );
}
