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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type CarType,
  useAdminCarTypes,
  useCarTypeMutations,
} from "@/hooks/use-admin";
import { useTenant } from "@/lib/tenant-context";
import { cn } from "@/lib/utils";

/** Car types administration: list, create/edit (name + sort), archive/restore. */
export function CarTypesSection() {
  const { activeCarWash, hasCapability } = useTenant();
  const carWashId = activeCarWash?.id ?? null;
  const canManage = hasCapability("catalog.manage");

  const t = useTranslations("admin");
  const tCarTypes = useTranslations("admin.carTypes");

  const query = useAdminCarTypes(carWashId);
  const { create, update, archive, restore } = useCarTypeMutations(carWashId);

  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<CarType | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const rows = useMemo(() => {
    const all = query.data ?? [];
    return showArchived ? all : all.filter((c) => c.is_active);
  }, [query.data, showArchived]);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(carType: CarType) {
    setEditing(carType);
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
        id="car-types"
        title={tCarTypes("title")}
        description={tCarTypes("description")}
        addLabel={tCarTypes("addCta")}
        onAdd={openCreate}
        canManage={canManage}
        showArchived={showArchived}
        onShowArchivedChange={setShowArchived}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        isEmpty={rows.length === 0}
        emptyTitle={tCarTypes("empty")}
        emptyHint={tCarTypes("emptyHint")}
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
            {rows.map((carType) => (
              <TableRow
                key={carType.id}
                className={cn(!carType.is_active && "opacity-60")}
              >
                <TableCell className="font-medium">{carType.name}</TableCell>
                <TableCell className="font-mono text-muted-foreground">
                  {carType.sort}
                </TableCell>
                <TableCell>
                  <ActiveBadge isActive={carType.is_active} />
                </TableCell>
                <TableCell>
                  <RowActions
                    isActive={carType.is_active}
                    canManage={canManage}
                    onEdit={() => openEdit(carType)}
                    onArchive={() => archive.mutate(carType.id)}
                    onRestore={() => restore.mutate(carType.id)}
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
        title={editing ? tCarTypes("editTitle") : tCarTypes("addTitle")}
        withSort
        initial={{ name: editing?.name ?? "", sort: editing?.sort ?? 0 }}
        pending={pending}
        onSubmit={submit}
      />
    </>
  );
}
