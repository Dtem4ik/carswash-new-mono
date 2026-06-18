"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRecordPayment } from "@/hooks/use-orders";
import {
  extractErrorCode,
  resolveErrorMessage,
  toErrorTranslator,
} from "@/lib/errors";
import { useFormatters } from "@/lib/format";

const METHODS = ["cash", "card", "transfer", "bonus"] as const;
const KINDS = ["payment", "refund"] as const;

/** Records a payment or refund against an order via a shadcn Dialog. */
export function RecordPaymentDialog({
  carWashId,
  orderId,
  currency,
}: {
  carWashId: string | null;
  orderId: string;
  currency: string;
}) {
  const t = useTranslations("orderDetail");
  const tMethod = useTranslations("paymentMethod");
  const tKind = useTranslations("paymentKind");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const fmt = useFormatters();
  const record = useRecordPayment(carWashId);

  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<(typeof METHODS)[number]>("cash");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("payment");
  const [amountMajor, setAmountMajor] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const minorFactor = currency ? fmt.minorFactor(currency) : 100;
  const amountMinor = Math.round(
    (Number.parseFloat(amountMajor) || 0) * minorFactor,
  );

  async function submit() {
    setErrorCode(null);
    if (amountMinor <= 0) return;
    try {
      await record.mutateAsync({
        orderId,
        body: { method, kind, amount_minor: amountMinor },
      });
      setOpen(false);
      setAmountMajor("");
      setKind("payment");
      setMethod("cash");
    } catch (error) {
      setErrorCode(extractErrorCode(error) ?? "unknown");
    }
  }

  return (
    <>
      <Button
        variant="outline"
        className="min-h-11"
        onClick={() => setOpen(true)}
      >
        {t("recordPayment")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("paymentDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("paymentDialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="pay-method">{t("method")}</Label>
              <Select
                value={method}
                onValueChange={(v) =>
                  v && setMethod(v as (typeof METHODS)[number])
                }
              >
                <SelectTrigger id="pay-method" className="h-9 w-full">
                  <SelectValue>{(v) => tMethod(v as string)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {tMethod(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="pay-kind">{t("kind")}</Label>
              <Select
                value={kind}
                onValueChange={(v) => v && setKind(v as (typeof KINDS)[number])}
              >
                <SelectTrigger id="pay-kind" className="h-9 w-full">
                  <SelectValue>{(v) => tKind(v as string)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {tKind(k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="pay-amount">{t("amount")}</Label>
              <Input
                id="pay-amount"
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                className="font-mono"
                value={amountMajor}
                onChange={(e) => setAmountMajor(e.target.value)}
              />
            </div>

            {errorCode ? (
              <p className="text-destructive text-sm" role="alert">
                {resolveErrorMessage(toErrorTranslator(tErrors), errorCode)}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={record.isPending}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              onClick={submit}
              disabled={record.isPending || amountMinor <= 0}
            >
              {record.isPending ? t("paymentSubmitting") : t("paymentSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
