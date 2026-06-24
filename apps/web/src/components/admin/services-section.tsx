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
  type Service,
  useAdminServices,
  useServiceMutations,
} from "@/hooks/use-admin";
import { useTenant } from "@/lib/tenant-context";
import { cn } from "@/lib/utils";

/** Services administration: list (with show-archived), create/edit, archive/restore. */
export function ServicesSection() {
  const { activeCarWash, hasCapability } = useTenant();
  const carWashId = activeCarWash?.id ?? null;
  const canManage = hasCapability("catalog.manage");

  const t = useTranslations("admin");
  const tServices = useTranslations("admin.services");

  const query = useAdminServices(carWashId);
  const { create, update, archive, restore } = useServiceMutations(carWashId);

  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const rows = useMemo(() => {
    const all = query.data ?? [];
    return showArchived ? all : all.filter((s) => s.is_active);
  }, [query.data, showArchived]);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(service: Service) {
    setEditing(service);
    setDialogOpen(true);
  }

  async function submit(values: EntityValues) {
    if (editing) {
      await update.mutateAsync({ id: editing.id, body: { name: values.name } });
    } else {
      await create.mutateAsync({ name: values.name });
    }
  }

  const pending = create.isPending || update.isPending;

  return (
    <>
      <AdminSection
        id="services"
        title={tServices("title")}
        description={tServices("description")}
        addLabel={tServices("addCta")}
        onAdd={openCreate}
        canManage={canManage}
        showArchived={showArchived}
        onShowArchivedChange={setShowArchived}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        isEmpty={rows.length === 0}
        emptyTitle={tServices("empty")}
        emptyHint={tServices("emptyHint")}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead className="text-right">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((service) => (
              <TableRow
                key={service.id}
                className={cn(!service.is_active && "opacity-60")}
              >
                <TableCell className="font-medium">{service.name}</TableCell>
                <TableCell>
                  <ActiveBadge isActive={service.is_active} />
                </TableCell>
                <TableCell>
                  <RowActions
                    isActive={service.is_active}
                    canManage={canManage}
                    onEdit={() => openEdit(service)}
                    onArchive={() => archive.mutate(service.id)}
                    onRestore={() => restore.mutate(service.id)}
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
        title={editing ? tServices("editTitle") : tServices("addTitle")}
        withSort={false}
        initial={{ name: editing?.name ?? "", sort: 0 }}
        pending={pending}
        onSubmit={submit}
      />
    </>
  );
}
