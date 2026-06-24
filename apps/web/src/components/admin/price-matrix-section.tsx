"use client";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { PriceMatrixGrid } from "@/components/admin/price-matrix-grid";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  usePackagePriceUpsert,
  useServicePriceUpsert,
} from "@/hooks/use-admin";
import {
  useCarTypes,
  usePackagePrices,
  usePackages,
  useServicePrices,
  useServices,
} from "@/hooks/use-catalog";
import { useFormatters } from "@/lib/format";
import { indexPrices } from "@/lib/price-matrix";
import { useTenant } from "@/lib/tenant-context";

/**
 * The price-matrix centerpiece: two editable grids for the active car wash —
 * service × car type and package × car type — each saving per cell via the
 * upsert endpoints. Columns are the active car types; rows are active
 * services / packages.
 */
export function PriceMatrixSection() {
  const { activeCarWash, hasCapability } = useTenant();
  const carWashId = activeCarWash?.id ?? null;
  const currency = activeCarWash?.currency ?? "";
  const canManage = hasCapability("pricing.edit");

  const t = useTranslations("admin.prices");
  const tCommon = useTranslations("common");
  const fmt = useFormatters();
  const minorFactor = currency ? fmt.minorFactor(currency) : 100;

  const carTypes = useCarTypes(carWashId);
  const services = useServices(carWashId);
  const packages = usePackages(carWashId);
  const servicePrices = useServicePrices(carWashId);
  const packagePrices = usePackagePrices(carWashId);

  const serviceUpsert = useServicePriceUpsert(carWashId);
  const packageUpsert = usePackagePriceUpsert(carWashId);

  const activeCarTypes = useMemo(
    () => (carTypes.data ?? []).filter((c) => c.is_active),
    [carTypes.data],
  );
  const activeServices = useMemo(
    () => (services.data ?? []).filter((s) => s.is_active),
    [services.data],
  );
  const activePackages = useMemo(
    () => (packages.data ?? []).filter((p) => p.is_active),
    [packages.data],
  );

  const serviceSaved = useMemo(
    () =>
      indexPrices(
        (servicePrices.data ?? []).map((p) => ({
          rowId: p.service_id,
          carTypeId: p.car_type_id,
          amountMinor: p.amount_minor,
        })),
      ),
    [servicePrices.data],
  );
  const packageSaved = useMemo(
    () =>
      indexPrices(
        (packagePrices.data ?? []).map((p) => ({
          rowId: p.package_id,
          carTypeId: p.car_type_id,
          amountMinor: p.amount_minor,
        })),
      ),
    [packagePrices.data],
  );

  const isLoading =
    carTypes.isLoading ||
    services.isLoading ||
    packages.isLoading ||
    servicePrices.isLoading ||
    packagePrices.isLoading;
  const isError =
    carTypes.isError ||
    services.isError ||
    packages.isError ||
    servicePrices.isError ||
    packagePrices.isError;

  function retry() {
    carTypes.refetch();
    services.refetch();
    packages.refetch();
    servicePrices.refetch();
    packagePrices.refetch();
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-5" aria-hidden="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 pt-5 text-center">
          <TriangleAlert className="text-destructive size-6" />
          <p className="text-muted-foreground text-sm">{t("title")}</p>
          <Button type="button" variant="outline" onClick={retry}>
            {tCommon("retry")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (activeCarTypes.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-1.5 py-10 pt-5 text-center">
          <p className="font-medium">{t("noCarTypes")}</p>
          <p className="text-muted-foreground text-sm">{t("noCarTypesHint")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("servicesTitle")}</CardTitle>
          <CardDescription>{t("description", { currency })}</CardDescription>
        </CardHeader>
        <CardContent>
          {activeServices.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {t("noServices")}
            </p>
          ) : (
            <PriceMatrixGrid
              rowLabel={t("rowService")}
              rows={activeServices.map((s) => ({ id: s.id, name: s.name }))}
              carTypes={activeCarTypes}
              savedMap={serviceSaved}
              minorFactor={minorFactor}
              currency={currency}
              canManage={canManage}
              onSave={(rowId, carTypeId, amountMinor) =>
                serviceUpsert
                  .mutateAsync({
                    service_id: rowId,
                    car_type_id: carTypeId,
                    amount_minor: amountMinor,
                  })
                  .then(() => undefined)
              }
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("packagesTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {activePackages.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {t("noPackages")}
            </p>
          ) : (
            <PriceMatrixGrid
              rowLabel={t("rowPackage")}
              rows={activePackages.map((p) => ({ id: p.id, name: p.name }))}
              carTypes={activeCarTypes}
              savedMap={packageSaved}
              minorFactor={minorFactor}
              currency={currency}
              canManage={canManage}
              onSave={(rowId, carTypeId, amountMinor) =>
                packageUpsert
                  .mutateAsync({
                    package_id: rowId,
                    car_type_id: carTypeId,
                    amount_minor: amountMinor,
                  })
                  .then(() => undefined)
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
