"use client";

import { Plus, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { MemberDialog } from "@/components/admin/member-dialog";
import { RowActions } from "@/components/admin/row-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  type Member,
  useMemberMutations,
  useMembers,
} from "@/hooks/use-members";
import { canManageMember } from "@/lib/members";
import { useTenant } from "@/lib/tenant-context";

/** Staff & roles admin: list members, invite by email, change role, remove. */
export function StaffSection() {
  const { activeCarWash, role, me, hasCapability } = useTenant();
  const carWashId = activeCarWash?.id ?? null;
  const canManage = hasCapability("users.manage");

  const t = useTranslations("admin.staff");
  const tAdmin = useTranslations("admin");
  const tRoles = useTranslations("roles");
  const tCommon = useTranslations("common");

  const query = useMembers(carWashId);
  const { invite, updateRole, remove } = useMemberMutations(carWashId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);

  const members = query.data ?? [];

  const canManageRow = (member: Member): boolean =>
    canManage &&
    canManageMember({
      callerRole: role,
      callerCarWashId: carWashId,
      member,
      selfUserId: me.user.id,
    });

  function openInvite() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(member: Member) {
    setEditing(member);
    setDialogOpen(true);
  }

  return (
    <>
      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="text-base">{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </div>
          {canManage ? (
            <Button type="button" onClick={openInvite} className="min-h-9">
              <Plus />
              {t("addCta")}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="space-y-2" aria-hidden="true">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : query.isError ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <TriangleAlert className="text-destructive size-6" />
              <p className="text-muted-foreground text-sm">
                {tAdmin("loadError")}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => query.refetch()}
              >
                {tCommon("retry")}
              </Button>
            </div>
          ) : members.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-10 text-center">
              <p className="font-medium">{t("empty")}</p>
              <p className="text-muted-foreground text-sm">{t("emptyHint")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("email")}</TableHead>
                  <TableHead>{t("role")}</TableHead>
                  <TableHead>{t("carWash")}</TableHead>
                  <TableHead className="text-right">
                    {tAdmin("actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.membership_id}>
                    <TableCell className="font-medium">
                      {member.full_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-sm">
                      {member.email ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{tRoles(member.role)}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {member.car_wash_name ?? t("orgLevel")}
                    </TableCell>
                    <TableCell>
                      <RowActions
                        isActive
                        canManage={canManageRow(member)}
                        onEdit={() => openEdit(member)}
                        onArchive={() => setRemoving(member)}
                        onRestore={() => undefined}
                        pending={remove.isPending}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <MemberDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={editing ? "edit" : "invite"}
        member={editing}
        carWashes={me.accessible_car_washes}
        callerRole={role}
        defaultCarWashId={carWashId}
        pending={invite.isPending || updateRole.isPending}
        onInvite={(body) => invite.mutateAsync(body)}
        onUpdate={(membershipId, body) =>
          updateRole.mutateAsync({ membershipId, body })
        }
      />

      <Dialog
        open={removing !== null}
        onOpenChange={(next) => !next && setRemoving(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("removeTitle")}</DialogTitle>
            <DialogDescription>
              {t("removeConfirm", {
                name: removing?.full_name ?? removing?.email ?? "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              {tCommon("cancel")}
            </Button>
            <Button
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={() => {
                if (removing) remove.mutate(removing.membership_id);
                setRemoving(null);
              }}
            >
              {t("removeCta")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
