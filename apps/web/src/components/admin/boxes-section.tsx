"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { ActiveBadge } from "@/components/admin/active-badge";
import { AdminSection } from "@/components/admin/admin-section";
import {
  EntityDialog,
  type EntityValues,
} from "@/components/admin/entity-dialog";
import { RowActions } from "@/components/admin/row-actions";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type Box, useAdminBoxes, useBoxMutations } from "@/hooks/use-admin";
import { BOX_STATUS_TONE } from "@/lib/status";
import { useTenant } from "@/lib/tenant-context";
import { cn } from "@/lib/utils";

/** Boxes administration: list (with live status), create/edit, archive/restore. */
export function BoxesSection() {
  const { activeCarWash, hasCapability } = useTenant();
  const carWashId = activeCarWash?.id ?? null;
  const canManage = hasCapability("boxes.manage");

  const t = useTranslations("admin");
  const tBoxes = useTranslations("admin.boxes");
  const tBoxStatus = useTranslations("boxStatus");

  const query = useAdminBoxes(carWashId);
  const { create, update, archive, restore } = useBoxMutations(carWashId);

  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Box | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const rows = useMemo(() => {
    const all = query.data ?? [];
    return showArchived ? all : all.filter((b) => b.is_active);
  }, [query.data, showArchived]);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(box: Box) {
    setEditing(box);
    setDialogOpen(true);
  }

  async function submit(values: EntityValues) {
    if (editing) {
      await update.mutateAsync({
        id: editing.id,
        body: { name: values.name, sort: values.sort },
      });
    } else {
      await create.mutateAsync({ name: values.name, sort: values.sort });
    }
  }

  const pending = create.isPending || update.isPending;

  return (
    <>
      <AdminSection
        id="boxes"
        title={tBoxes("title")}
        description={tBoxes("description")}
        addLabel={tBoxes("addCta")}
        onAdd={openCreate}
        canManage={canManage}
        showArchived={showArchived}
        onShowArchivedChange={setShowArchived}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        isEmpty={rows.length === 0}
        emptyTitle={tBoxes("empty")}
        emptyHint={tBoxes("emptyHint")}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("name")}</TableHead>
              <TableHead className="w-24">{t("sort")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead className="text-right">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((box) => (
              <TableRow
                key={box.id}
                className={cn(!box.is_active && "opacity-60")}
              >
                <TableCell className="font-medium">{box.name}</TableCell>
                <TableCell className="font-mono text-muted-foreground">
                  {box.sort}
                </TableCell>
                <TableCell>
                  {box.is_active ? (
                    <StatusBadge
                      tone={BOX_STATUS_TONE[box.status]}
                      label={tBoxStatus(box.status)}
                    />
                  ) : (
                    <ActiveBadge isActive={false} />
                  )}
                </TableCell>
                <TableCell>
                  <RowActions
                    isActive={box.is_active}
                    canManage={canManage}
                    onEdit={() => openEdit(box)}
                    onArchive={() => archive.mutate(box.id)}
                    onRestore={() => restore.mutate(box.id)}
                    pending={archive.isPending || restore.isPending}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AdminSection>

      <EntityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? tBoxes("editTitle") : tBoxes("addTitle")}
        withSort
        initial={{ name: editing?.name ?? "", sort: editing?.sort ?? 0 }}
        pending={pending}
        onSubmit={submit}
      />
    </>
  );
}
