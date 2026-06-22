"use client";

import { Plus, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { LicensePlate } from "@/components/license-plate";
import { StatusBadge } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBoxes } from "@/hooks/use-board-data";
import { useOrdersList } from "@/hooks/use-orders";
import {
  extractErrorCode,
  resolveErrorMessage,
  toErrorTranslator,
} from "@/lib/errors";
import { useFormatters } from "@/lib/format";
import {
  buildOrderListParams,
  type OrderFilters,
  type StatusFilter,
} from "@/lib/order-filters";
import { ORDER_STATUS_TONE, PAYMENT_STATUS_TONE } from "@/lib/status";
import { useTenant } from "@/lib/tenant-context";

const PAGE_SIZE = 20;
const ORDER_STATUSES: StatusFilter[] = [
  "queued",
  "in_progress",
  "done",
  "cancelled",
];

/** Paginated, filterable order list. Filters apply live; page resets on change. */
export function OrdersTable() {
  const { activeCarWash, hasCapability } = useTenant();
  const carWashId = activeCarWash?.id ?? null;
  const currency = activeCarWash?.currency ?? "";
  const timeZone = activeCarWash?.timezone ?? "UTC";
  const country = activeCarWash?.country ?? null;

  const router = useRouter();
  const t = useTranslations("orders");
  const tStatus = useTranslations("orderStatus");
  const tPay = useTranslations("paymentStatus");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const fmt = useFormatters();

  const boxes = useBoxes(carWashId);

  const [filters, setFilters] = useState<OrderFilters>({
    status: "",
    boxId: "",
    from: "",
    to: "",
    page: 0,
    pageSize: PAGE_SIZE,
  });

  function patch(next: Partial<OrderFilters>) {
    setFilters((prev) => ({ ...prev, ...next, page: next.page ?? 0 }));
  }

  const query = useMemo(
    () => buildOrderListParams(filters, timeZone),
    [filters, timeZone],
  );
  const orders = useOrdersList(carWashId, query);

  const total = orders.data?.total ?? 0;
  const from = total === 0 ? 0 : filters.page * PAGE_SIZE + 1;
  const to = Math.min(total, (filters.page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <Field label={t("status")}>
            <Select
              value={filters.status || "all"}
              onValueChange={(v) =>
                patch({ status: (!v || v === "all" ? "" : v) as StatusFilter })
              }
            >
              <SelectTrigger className="h-9 w-full sm:w-40">
                <SelectValue>
                  {(v) =>
                    v === "all" || !v ? t("allStatuses") : tStatus(v as string)
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allStatuses")}</SelectItem>
                {ORDER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {tStatus(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label={t("box")}>
            <Select
              value={filters.boxId || "all"}
              onValueChange={(v) =>
                patch({ boxId: !v || v === "all" ? "" : v })
              }
            >
              <SelectTrigger className="h-9 w-full sm:w-40">
                <SelectValue>
                  {(v) =>
                    v === "all" || !v
                      ? t("allBoxes")
                      : ((boxes.data ?? []).find((b) => b.id === v)?.name ??
                        t("allBoxes"))
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allBoxes")}</SelectItem>
                {(boxes.data ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label={t("from")}>
            <Input
              type="date"
              value={filters.from}
              onChange={(e) => patch({ from: e.target.value })}
              className="h-9 w-full sm:w-40"
            />
          </Field>
          <Field label={t("to")}>
            <Input
              type="date"
              value={filters.to}
              onChange={(e) => patch({ to: e.target.value })}
              className="h-9 w-full sm:w-40"
            />
          </Field>

          <Button
            variant="ghost"
            className="h-9"
            onClick={() =>
              setFilters({
                status: "",
                boxId: "",
                from: "",
                to: "",
                page: 0,
                pageSize: PAGE_SIZE,
              })
            }
          >
            {tCommon("reset")}
          </Button>
        </div>

        {hasCapability("orders.create") ? (
          <Link
            href="/orders/new"
            className={buttonVariants({ variant: "default" })}
          >
            <Plus size={16} aria-hidden="true" />
            {t("new")}
          </Link>
        ) : null}
      </div>

      {orders.isError ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/5 text-destructive flex flex-col items-start gap-3 rounded-2xl border p-5 text-sm"
        >
          <div className="flex items-center gap-2 font-medium">
            <TriangleAlert size={18} aria-hidden="true" />
            {t("loadError")}
          </div>
          <p>
            {resolveErrorMessage(
              toErrorTranslator(tErrors),
              extractErrorCode(orders.error),
            )}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => orders.refetch()}
          >
            {tCommon("retry")}
          </Button>
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">{t("colNumber")}</TableHead>
                <TableHead>{t("colCar")}</TableHead>
                <TableHead>{t("colStatus")}</TableHead>
                <TableHead className="text-right">{t("colTotal")}</TableHead>
                <TableHead>{t("colPayment")}</TableHead>
                <TableHead className="text-right">{t("colCreated")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.isPending ? (
                Array.from({ length: 6 }).map((_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : (orders.data?.items.length ?? 0) === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center">
                    <p className="font-medium">{t("empty")}</p>
                    <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">
                      {t("emptyHint")}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                orders.data?.items.map((order) => (
                  <TableRow
                    key={order.id}
                    onClick={() => router.push(`/orders/${order.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-mono font-medium">
                      <Link
                        href={`/orders/${order.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-primary"
                      >
                        #{order.number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        {order.plate ? (
                          <LicensePlate
                            plate={order.plate}
                            country={country}
                            size="sm"
                          />
                        ) : (
                          <span className="font-mono">{t("noPlate")}</span>
                        )}
                        <span className="text-muted-foreground text-xs">
                          {[order.car_brand, order.car_model]
                            .filter(Boolean)
                            .join(" ") ||
                            (order.client_name ?? t("walkIn"))}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={ORDER_STATUS_TONE[order.status]}
                        label={tStatus(order.status)}
                      />
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmt.money(order.total_minor, currency)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={PAYMENT_STATUS_TONE[order.payment_status]}
                        label={tPay(order.payment_status)}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right font-mono text-xs">
                      {fmt.dateTime(order.created_at, timeZone)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {t("pageInfo", { from, to, total })}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            disabled={filters.page === 0}
            onClick={() => setFilters((p) => ({ ...p, page: p.page - 1 }))}
          >
            {t("prev")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            disabled={to >= total}
            onClick={() => setFilters((p) => ({ ...p, page: p.page + 1 }))}
          >
            {t("next")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      {children}
    </div>
  );
}
