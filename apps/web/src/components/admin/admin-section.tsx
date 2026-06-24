"use client";

import { Plus, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

/**
 * Shared frame for the catalog/box list sections: a titled card whose header
 * carries the "show archived" toggle and the gated add button, and which renders
 * the mandatory loading / error / empty states (docs/UI.md) before handing off
 * to the table content.
 */
export function AdminSection({
  id,
  title,
  description,
  addLabel,
  onAdd,
  canManage,
  showArchived,
  onShowArchivedChange,
  isLoading,
  isError,
  onRetry,
  isEmpty,
  emptyTitle,
  emptyHint,
  children,
}: {
  id: string;
  title: string;
  description: string;
  addLabel: string;
  onAdd: () => void;
  canManage: boolean;
  showArchived: boolean;
  onShowArchivedChange: (next: boolean) => void;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  isEmpty: boolean;
  emptyTitle: string;
  emptyHint: string;
  children: ReactNode;
}) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const toggleId = `${id}-show-archived`;

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <Switch
              id={toggleId}
              checked={showArchived}
              onCheckedChange={onShowArchivedChange}
            />
            <Label htmlFor={toggleId} className="text-muted-foreground text-sm">
              {t("showArchived")}
            </Label>
          </div>
          {canManage ? (
            <Button type="button" onClick={onAdd} className="min-h-9">
              <Plus />
              {addLabel}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2" aria-hidden="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <TriangleAlert className="text-destructive size-6" />
            <p className="text-muted-foreground text-sm">{t("loadError")}</p>
            <Button type="button" variant="outline" onClick={onRetry}>
              {tCommon("retry")}
            </Button>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center gap-1.5 py-10 text-center">
            <p className="font-medium">{emptyTitle}</p>
            <p className="text-muted-foreground text-sm">{emptyHint}</p>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
