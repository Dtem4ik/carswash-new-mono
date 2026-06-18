"use client";

import { ArrowLeft, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { RecordPaymentDialog } from "@/components/orders/record-payment-dialog";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePackages, useServices, useStaff } from "@/hooks/use-catalog";
import { useCancelOrder, useCloseOrder, useOrder } from "@/hooks/use-orders";
import {
  extractErrorCode,
  resolveErrorMessage,
  toErrorTranslator,
} from "@/lib/errors";
import { useFormatters } from "@/lib/format";
import { ORDER_STATUS_TONE, PAYMENT_STATUS_TONE } from "@/lib/status";
import { useTenant } from "@/lib/tenant-context";

/** Full order breakdown with capability-gated close / cancel / payment actions. */
export function OrderDetail({ orderId }: { orderId: string }) {
  const { activeCarWash, hasCapability } = useTenant();
  const carWashId = activeCarWash?.id ?? null;
  const currency = activeCarWash?.currency ?? "";
  const timeZone = activeCarWash?.timezone ?? "UTC";

  const t = useTranslations("orderDetail");
  const tStatus = useTranslations("orderStatus");
  const tPay = useTranslations("paymentStatus");
  const tMethod = useTranslations("paymentMethod");
  const tKind = useTranslations("paymentKind");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const fmt = useFormatters();

  const order = useOrder(carWashId, orderId);
  const services = useServices(carWashId);
  const packages = usePackages(carWashId);
  const staff = useStaff(carWashId);
  const closeOrder = useCloseOrder(carWashId);
  const cancelOrder = useCancelOrder(carWashId);

  const serviceName = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of services.data ?? []) map.set(s.id, s.name);
    return map;
  }, [services.data]);
  const staffName = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of staff.data ?? []) if (s.name) map.set(s.user_id, s.name);
    return map;
  }, [staff.data]);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [actionErrorCode, setActionErrorCode] = useState<string | null>(null);

  async function runClose() {
    setActionErrorCode(null);
    try {
      await closeOrder.mutateAsync(orderId);
    } catch (error) {
      setActionErrorCode(extractErrorCode(error) ?? "unknown");
    }
  }
  async function runCancel() {
    setActionErrorCode(null);
    try {
      await cancelOrder.mutateAsync(orderId);
      setCancelOpen(false);
    } catch (error) {
      setActionErrorCode(extractErrorCode(error) ?? "unknown");
      setCancelOpen(false);
    }
  }

  const backLink = (
    <Link
      href="/orders"
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
    >
      <ArrowLeft size={16} aria-hidden="true" />
      {t("back")}
    </Link>
  );

  if (order.isPending) {
    return (
      <div className="space-y-6">
        {backLink}
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (order.isError || !order.data) {
    return (
      <div className="space-y-6">
        {backLink}
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
              extractErrorCode(order.error),
            )}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => order.refetch()}
          >
            {tCommon("retry")}
          </Button>
        </div>
      </div>
    );
  }

  const o = order.data;
  const packageName = o.package_id
    ? (packages.data ?? []).find((p) => p.id === o.package_id)?.name
    : null;

  const canClose = o.status === "in_progress" && hasCapability("orders.close");
  const canCancel =
    (o.status === "in_progress" || o.status === "queued") &&
    hasCapability("orders.cancel");
  const canPay = o.status !== "cancelled" && hasCapability("payments.record");

  return (
    <div className="space-y-6">
      {backLink}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-xl font-semibold tracking-tight">
            {t("title", { number: o.number })}
          </h1>
          <StatusBadge
            tone={ORDER_STATUS_TONE[o.status]}
            label={tStatus(o.status)}
          />
          <StatusBadge
            tone={PAYMENT_STATUS_TONE[o.payment_status]}
            label={tPay(o.payment_status)}
          />
        </div>
        <div className="text-muted-foreground text-sm">
          <span className="font-mono">{o.plate ?? "—"}</span>
          {o.client_name ? <span> · {o.client_name}</span> : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {/* Services -------------------------------------------------- */}
          <Card className="gap-0 overflow-hidden p-0">
            <h2 className="border-b p-4 font-semibold tracking-tight">
              {t("services")}
            </h2>
            {o.services.length === 0 && !packageName ? (
              <p className="text-muted-foreground p-4 text-sm">
                {t("noServices")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("service")}</TableHead>
                    <TableHead className="text-right">{t("qty")}</TableHead>
                    <TableHead className="text-right">
                      {t("unitPrice")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("lineTotal")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {o.services.map((line) => (
                    <TableRow key={line.service_id}>
                      <TableCell>
                        {serviceName.get(line.service_id) ??
                          line.service_id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {line.qty}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {fmt.money(line.unit_amount_minor, currency)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {fmt.money(line.unit_amount_minor * line.qty, currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {packageName ? (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <span className="text-muted-foreground">
                          {t("package")}:
                        </span>{" "}
                        {packageName}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            )}
          </Card>

          {/* Washers --------------------------------------------------- */}
          <Card className="gap-3 p-5">
            <h2 className="font-semibold tracking-tight">{t("washers")}</h2>
            {o.washers.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("noWashers")}</p>
            ) : (
              <ul className="grid gap-2">
                {o.washers.map((w) => (
                  <li
                    key={w.user_id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span>{w.name ?? w.user_id.slice(0, 8)}</span>
                    <span className="text-muted-foreground font-mono">
                      {(w.share_bps / 100).toFixed(0)}% ·{" "}
                      {fmt.money(w.earned_amount_minor, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Payments -------------------------------------------------- */}
          <Card className="gap-0 overflow-hidden p-0">
            <h2 className="border-b p-4 font-semibold tracking-tight">
              {t("payments")}
            </h2>
            {o.payments.length === 0 ? (
              <p className="text-muted-foreground p-4 text-sm">
                {t("noPayments")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("method")}</TableHead>
                    <TableHead>{t("kind")}</TableHead>
                    <TableHead className="text-right">{t("amount")}</TableHead>
                    <TableHead>{t("receivedBy")}</TableHead>
                    <TableHead className="text-right">{t("paidAt")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {o.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{tMethod(p.method)}</TableCell>
                      <TableCell>{tKind(p.kind)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {p.kind === "refund" ? "−" : ""}
                        {fmt.money(p.amount_minor, p.currency)}
                      </TableCell>
                      <TableCell>
                        {p.received_by
                          ? (staffName.get(p.received_by) ?? t("unknownUser"))
                          : t("unknownUser")}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right font-mono text-xs">
                        {fmt.dateTime(p.paid_at, timeZone)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>

        {/* Sidebar: totals + timeline + actions ----------------------- */}
        <div className="space-y-6">
          <Card className="gap-3 p-5">
            <h2 className="font-semibold tracking-tight">{t("totals")}</h2>
            <dl className="grid gap-2 text-sm">
              <SummaryRow label={t("subtotal")}>
                {fmt.money(o.subtotal_minor, currency)}
              </SummaryRow>
              <SummaryRow label={t("discount")}>
                −{fmt.money(o.discount_amount_minor, currency)}
              </SummaryRow>
              <SummaryRow label={t("total")}>
                <span className="text-status-progress text-lg font-semibold">
                  {fmt.money(o.total_minor, currency)}
                </span>
              </SummaryRow>
              <div className="my-1 border-t" />
              <SummaryRow label={t("paid")}>
                {fmt.money(o.paid_total_minor, currency)}
              </SummaryRow>
              <SummaryRow label={t("balance")}>
                {fmt.money(o.balance_minor, currency)}
              </SummaryRow>
            </dl>
          </Card>

          <Card className="gap-3 p-5">
            <h2 className="font-semibold tracking-tight">{t("timeline")}</h2>
            <dl className="grid gap-2 text-sm">
              <SummaryRow label={t("createdAt")}>
                <span className="font-mono">
                  {fmt.dateTime(o.created_at, timeZone)}
                </span>
              </SummaryRow>
              <SummaryRow label={t("startedAt")}>
                <span className="font-mono">
                  {o.started_at
                    ? fmt.dateTime(o.started_at, timeZone)
                    : t("notStarted")}
                </span>
              </SummaryRow>
              <SummaryRow label={t("finishedAt")}>
                <span className="font-mono">
                  {o.finished_at
                    ? fmt.dateTime(o.finished_at, timeZone)
                    : t("notFinished")}
                </span>
              </SummaryRow>
            </dl>
          </Card>

          {canClose || canCancel || canPay ? (
            <Card className="gap-3 p-5">
              <h2 className="font-semibold tracking-tight">{t("actions")}</h2>
              <div className="grid gap-2">
                {canClose ? (
                  <Button
                    className="min-h-11"
                    onClick={runClose}
                    disabled={closeOrder.isPending}
                  >
                    {closeOrder.isPending ? t("closing") : t("close")}
                  </Button>
                ) : null}
                {canPay ? (
                  <RecordPaymentDialog
                    carWashId={carWashId}
                    orderId={orderId}
                    currency={currency}
                  />
                ) : null}
                {canCancel ? (
                  <Button
                    variant="ghost"
                    className="text-destructive hover:text-destructive min-h-11"
                    onClick={() => setCancelOpen(true)}
                    disabled={cancelOrder.isPending}
                  >
                    {t("cancel")}
                  </Button>
                ) : null}
              </div>
              {actionErrorCode ? (
                <p className="text-destructive text-sm" role="alert">
                  {resolveErrorMessage(
                    toErrorTranslator(tErrors),
                    actionErrorCode,
                  )}
                </p>
              ) : null}
            </Card>
          ) : null}
        </div>
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("cancelDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("cancelDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              {tCommon("close")}
            </Button>
            <Button
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={runCancel}
              disabled={cancelOrder.isPending}
            >
              {cancelOrder.isPending ? t("cancelling") : t("confirmCancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono">{children}</dd>
    </div>
  );
}
