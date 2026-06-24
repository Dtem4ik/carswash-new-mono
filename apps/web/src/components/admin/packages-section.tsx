"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { ActiveBadge } from "@/components/admin/active-badge";
import { AdminSection } from "@/components/admin/admin-section";
import {
  PackageDialog,
  type PackageValues,
} from "@/components/admin/package-dialog";
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
  type Package,
  useAdminPackages,
  usePackageMutations,
} from "@/hooks/use-admin";
import { useServices } from "@/hooks/use-catalog";
import { useTenant } from "@/lib/tenant-context";
import { cn } from "@/lib/utils";

/**
 * Packages administration: list, create/edit (name + its services membership),
 * archive/restore. The dialog offers only active services to bundle.
 */
export function PackagesSection() {
  const { activeCarWash, hasCapability } = useTenant();
  const carWashId = activeCarWash?.id ?? null;
  const canManage = hasCapability("catalog.manage");

  const t = useTranslations("admin");
  const tPackages = useTranslations("admin.packages");

  const query = useAdminPackages(carWashId);
  const services = useServices(carWashId);
  const { create, update, setServices, archive, restore } =
    usePackageMutations(carWashId);

  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Package | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const rows = useMemo(() => {
    const all = query.data ?? [];
    return showArchived ? all : all.filter((p) => p.is_active);
  }, [query.data, showArchived]);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(pkg: Package) {
    setEditing(pkg);
    setDialogOpen(true);
  }

  async function submit(values: PackageValues) {
    if (editing) {
      await update.mutateAsync({ id: editing.id, body: { name: values.name } });
      await setServices.mutateAsync({
        id: editing.id,
        serviceIds: values.serviceIds,
      });
    } else {
      const created = await create.mutateAsync({ name: values.name });
      await setServices.mutateAsync({
        id: created.id,
        serviceIds: values.serviceIds,
      });
    }
  }

  const pending = create.isPending || update.isPending || setServices.isPending;

  return (
    <>
      <AdminSection
        id="packages"
        title={tPackages("title")}
        description={tPackages("description")}
        addLabel={tPackages("addCta")}
        onAdd={openCreate}
        canManage={canManage}
        showArchived={showArchived}
        onShowArchivedChange={setShowArchived}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        isEmpty={rows.length === 0}
        emptyTitle={tPackages("empty")}
        emptyHint={tPackages("emptyHint")}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{tPackages("includedServices")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead className="text-right">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((pkg) => (
              <TableRow
                key={pkg.id}
                className={cn(!pkg.is_active && "opacity-60")}
              >
                <TableCell className="font-medium">{pkg.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {tPackages("serviceCount", { count: pkg.service_ids.length })}
                </TableCell>
                <TableCell>
                  <ActiveBadge isActive={pkg.is_active} />
                </TableCell>
                <TableCell>
                  <RowActions
                    isActive={pkg.is_active}
                    canManage={canManage}
                    onEdit={() => openEdit(pkg)}
                    onArchive={() => archive.mutate(pkg.id)}
                    onRestore={() => restore.mutate(pkg.id)}
                    pending={archive.isPending || restore.isPending}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AdminSection>

      <PackageDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? tPackages("editTitle") : tPackages("addTitle")}
        initial={{
          name: editing?.name ?? "",
          serviceIds: editing?.service_ids ?? [],
        }}
        services={(services.data ?? []).filter((s) => s.is_active)}
        pending={pending}
        onSubmit={submit}
      />
    </>
  );
}
