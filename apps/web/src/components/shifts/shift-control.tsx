"use client";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { useCurrentShift } from "@/hooks/use-board-data";
import {
  type CashMovementType,
  type ShiftCloseOut,
  useCloseShift,
  useOpenShift,
  useRecordCashMovement,
} from "@/hooks/use-shift";
import {
  extractErrorCode,
  resolveErrorMessage,
  toErrorTranslator,
} from "@/lib/errors";
import { useFormatters } from "@/lib/format";
import { useTenant } from "@/lib/tenant-context";

const CASH_TYPES: CashMovementType[] = [
  "expense",
  "payout",
  "collection",
  "deposit",
];

/** Open / reconcile the till: open form, current summary, cash movements, close. */
export function ShiftControl() {
  const { activeCarWash, hasCapability } = useTenant();
  const carWashId = activeCarWash?.id ?? null;
  const currency = activeCarWash?.currency ?? "";
  const timeZone = activeCarWash?.timezone ?? "UTC";

  const t = useTranslations("shift");
  const tCash = useTranslations("cashMovementType");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const fmt = useFormatters();

  const shift = useCurrentShift(carWashId);
  const openShift = useOpenShift(carWashId);
  const cashMovement = useRecordCashMovement(carWashId);
  const closeShift = useCloseShift(carWashId);

  const canManage = hasCapability("shifts.manage");
  const canCash = hasCapability("cash.record");
  const minorFactor = currency ? fmt.minorFactor(currency) : 100;
  const toMinor = (s: string) =>
    Math.round((Number.parseFloat(s) || 0) * minorFactor);

  const [openingFloat, setOpeningFloat] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [cashType, setCashType] = useState<CashMovementType>("expense");
  const [cashAmount, setCashAmount] = useState("");
  const [cashReason, setCashReason] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [reconciliation, setReconciliation] = useState<ShiftCloseOut | null>(
    null,
  );

  async function doOpen() {
    setErrorCode(null);
    try {
      await openShift.mutateAsync({
        opening_float_minor: toMinor(openingFloat),
      });
      setOpeningFloat("");
    } catch (error) {
      setErrorCode(extractErrorCode(error) ?? "unknown");
    }
  }
  async function doCash() {
    setErrorCode(null);
    if (toMinor(cashAmount) <= 0) return;
    try {
      await cashMovement.mutateAsync({
        type: cashType,
        amount_minor: toMinor(cashAmount),
        reason: cashReason.trim() || null,
      });
      setCashAmount("");
      setCashReason("");
    } catch (error) {
      setErrorCode(extractErrorCode(error) ?? "unknown");
    }
  }
  async function doClose() {
    setErrorCode(null);
    try {
      const result = await closeShift.mutateAsync({
        counted_cash_minor: toMinor(countedCash),
      });
      setReconciliation(result);
      setCountedCash("");
    } catch (error) {
      setErrorCode(extractErrorCode(error) ?? "unknown");
    }
  }

  if (!activeCarWash) {
    return <Notice text={tErrors("tenant.car_wash_required")} />;
  }
  if (shift.isPending) {
    return <Skeleton className="h-64 w-full" />;
  }

  const open = shift.data ?? null;
  const errorBanner = errorCode ? (
    <p className="text-destructive text-sm" role="alert">
      {resolveErrorMessage(toErrorTranslator(tErrors), errorCode)}
    </p>
  ) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {reconciliation ? (
        <Card className="gap-3 p-5 lg:col-span-2">
          <h2 className="font-semibold tracking-tight">
            {t("reconcileTitle")}
          </h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <Stat label={t("expected")}>
              {fmt.money(reconciliation.expected_minor, currency)}
            </Stat>
            <Stat label={t("counted")}>
              {fmt.money(reconciliation.counted_minor, currency)}
            </Stat>
            <Stat
              label={t("variance")}
              tone={
                reconciliation.variance_minor === 0
                  ? "default"
                  : reconciliation.variance_minor > 0
                    ? "positive"
                    : "negative"
              }
            >
              {reconciliation.variance_minor > 0 ? "+" : ""}
              {fmt.money(reconciliation.variance_minor, currency)}
            </Stat>
          </dl>
        </Card>
      ) : null}

      {open ? (
        <>
          <Card className="gap-3 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold tracking-tight">
                {t("currentTitle")}
              </h2>
              <StatusBadge tone="progress" label={t("openTitle")} />
            </div>
            <dl className="grid gap-2 text-sm">
              <Stat label={t("openedAt")}>
                <span className="font-mono">
                  {fmt.dateTime(open.opened_at, timeZone)}
                </span>
              </Stat>
              <Stat label={t("openingFloat")}>
                <span className="font-mono">
                  {fmt.money(open.opening_float_minor, currency)}
                </span>
              </Stat>
            </dl>
          </Card>

          {canCash ? (
            <Card className="gap-3 p-5">
              <h2 className="font-semibold tracking-tight">{t("cashTitle")}</h2>
              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="cash-type">{t("cashType")}</Label>
                  <Select
                    value={cashType}
                    onValueChange={(v) =>
                      v && setCashType(v as CashMovementType)
                    }
                  >
                    <SelectTrigger id="cash-type" className="h-9 w-full">
                      <SelectValue>{(v) => tCash(v as string)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {CASH_TYPES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {tCash(c)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="cash-amount">{t("cashAmount")}</Label>
                  <Input
                    id="cash-amount"
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    className="font-mono"
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="cash-reason">{t("cashReason")}</Label>
                  <Textarea
                    id="cash-reason"
                    rows={2}
                    placeholder={t("cashReasonPlaceholder")}
                    value={cashReason}
                    onChange={(e) => setCashReason(e.target.value)}
                  />
                </div>
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={doCash}
                  disabled={cashMovement.isPending || toMinor(cashAmount) <= 0}
                >
                  {cashMovement.isPending
                    ? tCommon("submitting")
                    : t("recordCash")}
                </Button>
              </div>
            </Card>
          ) : null}

          {canManage ? (
            <Card className="gap-3 p-5 lg:col-span-2">
              <h2 className="font-semibold tracking-tight">
                {t("closeTitle")}
              </h2>
              <div className="flex flex-wrap items-end gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="counted-cash">{t("countedCash")}</Label>
                  <Input
                    id="counted-cash"
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    className="h-9 w-48 font-mono"
                    value={countedCash}
                    onChange={(e) => setCountedCash(e.target.value)}
                  />
                </div>
                <Button
                  className="min-h-11"
                  onClick={doClose}
                  disabled={closeShift.isPending}
                >
                  {closeShift.isPending ? t("closing") : t("close")}
                </Button>
              </div>
              {errorBanner}
            </Card>
          ) : null}

          {!canManage && !canCash ? (
            <Card className="gap-2 p-5">
              <p className="text-muted-foreground text-sm">{t("readOnly")}</p>
            </Card>
          ) : null}
          {canCash && !canManage ? errorBanner : null}
        </>
      ) : (
        <Card className="gap-4 p-5 lg:col-span-2">
          <div className="space-y-1">
            <h2 className="font-semibold tracking-tight">
              {t("noShiftTitle")}
            </h2>
            <p className="text-muted-foreground text-sm">{t("noShiftHint")}</p>
          </div>
          {canManage ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-2">
                <Label htmlFor="opening-float">{t("openingFloat")}</Label>
                <Input
                  id="opening-float"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  className="h-9 w-48 font-mono"
                  value={openingFloat}
                  onChange={(e) => setOpeningFloat(e.target.value)}
                />
              </div>
              <Button
                className="min-h-11"
                onClick={doOpen}
                disabled={openShift.isPending}
              >
                {openShift.isPending ? t("opening") : t("open")}
              </Button>
              {errorBanner}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t("readOnly")}</p>
          )}
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  tone = "default",
  children,
}: {
  label: string;
  tone?: "default" | "positive" | "negative";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "positive"
      ? "text-status-free"
      : tone === "negative"
        ? "text-destructive"
        : "";
  return (
    <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-start">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`font-mono text-lg font-semibold ${toneClass}`}>
        {children}
      </dd>
    </div>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <div className="bg-card flex items-center gap-2 rounded-2xl border p-5 text-sm shadow-sm">
      <TriangleAlert
        size={18}
        aria-hidden="true"
        className="text-destructive"
      />
      <p>{text}</p>
    </div>
  );
}
