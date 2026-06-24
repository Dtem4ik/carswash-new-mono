"use client";

import { Check, Loader2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CarType } from "@/hooks/use-catalog";
import {
  type CellStatus,
  formatMinorToInput,
  isCellDirty,
  parseAmountToMinor,
  priceKey,
} from "@/lib/price-matrix";

export interface MatrixRow {
  id: string;
  name: string;
}

/**
 * Editable price grid: one row per service/package, one column per car type.
 * Each cell holds a major-unit amount in the wash currency; on blur (or Enter) a
 * changed cell is upserted via `onSave` and shows a saving / saved / error state.
 * Empty cells stay unpriced. Draft + status are local; the canonical amounts come
 * from `savedMap` (cell key → minor units), refreshed by the parent's query.
 */
export function PriceMatrixGrid({
  rowLabel,
  rows,
  carTypes,
  savedMap,
  minorFactor,
  currency,
  canManage,
  onSave,
}: {
  rowLabel: string;
  rows: MatrixRow[];
  carTypes: CarType[];
  savedMap: Map<string, number>;
  minorFactor: number;
  currency: string;
  canManage: boolean;
  onSave: (
    rowId: string,
    carTypeId: string,
    amountMinor: number,
  ) => Promise<void>;
}) {
  const t = useTranslations("admin.prices");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, CellStatus>>({});

  function displayValue(key: string, savedMinor: number | undefined): string {
    return drafts[key] ?? formatMinorToInput(savedMinor, minorFactor);
  }

  function setStatus(key: string, status: CellStatus) {
    setStatuses((prev) => ({ ...prev, [key]: status }));
  }

  async function commit(
    key: string,
    rowId: string,
    carTypeId: string,
    savedMinor: number | undefined,
  ) {
    const raw = drafts[key];
    if (raw === undefined) return;
    if (!isCellDirty(raw, savedMinor, minorFactor)) return;
    const amountMinor = parseAmountToMinor(raw, minorFactor);
    if (amountMinor === null) return;
    setStatus(key, "saving");
    try {
      await onSave(rowId, carTypeId, amountMinor);
      setStatus(key, "saved");
    } catch {
      setStatus(key, "error");
    }
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-40">{rowLabel}</TableHead>
            {carTypes.map((carType) => (
              <TableHead key={carType.id} className="min-w-32 text-right">
                {carType.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.name}</TableCell>
              {carTypes.map((carType) => {
                const key = priceKey(row.id, carType.id);
                const savedMinor = savedMap.get(key);
                const status = statuses[key] ?? "idle";
                return (
                  <TableCell key={carType.id}>
                    <div className="relative">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        disabled={!canManage || status === "saving"}
                        aria-label={`${row.name} — ${carType.name}, ${t("cellAmount", { currency })}`}
                        className="h-9 pr-7 text-right font-mono tabular-nums"
                        value={displayValue(key, savedMinor)}
                        onChange={(e) => {
                          setDrafts((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }));
                          if (status !== "idle") setStatus(key, "idle");
                        }}
                        onBlur={() =>
                          commit(key, row.id, carType.id, savedMinor)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.currentTarget.blur();
                          }
                        }}
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                        {status === "saving" ? (
                          <Loader2 className="text-muted-foreground size-3.5 animate-spin" />
                        ) : status === "saved" ? (
                          <Check className="text-status-free size-3.5" />
                        ) : status === "error" ? (
                          <TriangleAlert className="text-destructive size-3.5" />
                        ) : null}
                      </span>
                    </div>
                    {status === "error" ? (
                      <span className="text-destructive mt-1 block text-right text-xs">
                        {t("saveError")}
                      </span>
                    ) : null}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
