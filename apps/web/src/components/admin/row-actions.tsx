"use client";

import { ArchiveRestore, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * Edit + Archive/Restore controls shared by every catalog/box list row. The
 * archive vs restore affordance flips with the row's active state; all actions
 * are hidden when the caller cannot manage the resource (read-only roles never
 * reach the admin section, but this keeps the row honest).
 */
export function RowActions({
  isActive,
  canManage,
  onEdit,
  onArchive,
  onRestore,
  pending,
}: {
  isActive: boolean;
  canManage: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  pending?: boolean;
}) {
  const t = useTranslations("admin");
  if (!canManage) return null;

  return (
    <div className="flex items-center justify-end gap-1">
      {isActive ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 sm:size-9"
            aria-label={t("edit")}
            onClick={onEdit}
            disabled={pending}
          >
            <Pencil />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive size-11 sm:size-9"
            aria-label={t("archive")}
            onClick={onArchive}
            disabled={pending}
          >
            <Trash2 />
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 sm:min-h-9"
          onClick={onRestore}
          disabled={pending}
        >
          <ArchiveRestore />
          {t("restore")}
        </Button>
      )}
    </div>
  );
}
