"use client";

import type { CarWash, Role } from "@carswash/shared";
import { Check, Copy, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
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
import type {
  Member,
  MemberInviteResult,
  MemberRoleUpdate,
} from "@/hooks/use-members";
import {
  extractErrorCode,
  resolveErrorMessage,
  toErrorTranslator,
} from "@/lib/errors";
import { isLocationRole } from "@/lib/members";

const ALL_ROLES: Role[] = ["owner", "org_admin", "manager", "washer"];

/**
 * Add (invite) or edit a staff member. A manager may only add washers at their
 * own car wash, so the role/scope are fixed for them. On a successful invite of
 * a brand-new account it reveals the one-time temporary password with a copy
 * button; errors show inline (the mutation opts out of the global modal).
 */
export function MemberDialog({
  open,
  onOpenChange,
  mode,
  member,
  carWashes,
  callerRole,
  defaultCarWashId,
  pending,
  onInvite,
  onUpdate,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  mode: "invite" | "edit";
  member: Member | null;
  carWashes: CarWash[];
  callerRole: Role;
  defaultCarWashId: string | null;
  pending: boolean;
  onInvite: (body: {
    email: string;
    role: Role;
    car_wash_id: string | null;
  }) => Promise<MemberInviteResult>;
  onUpdate: (membershipId: string, body: MemberRoleUpdate) => Promise<Member>;
}) {
  const t = useTranslations("admin.staff");
  const tRoles = useTranslations("roles");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");

  const managerOnly = callerRole === "manager";
  const roleOptions = managerOnly ? (["washer"] as Role[]) : ALL_ROLES;

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("washer");
  const [carWashId, setCarWashId] = useState<string>("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [result, setResult] = useState<MemberInviteResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Re-seed each time the dialog opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: seed on open only
  useEffect(() => {
    if (!open) return;
    setEmail("");
    setErrorCode(null);
    setResult(null);
    setCopied(false);
    setRole(managerOnly ? "washer" : (member?.role ?? "washer"));
    setCarWashId(member?.car_wash_id ?? defaultCarWashId ?? "");
  }, [open]);

  const locationRole = isLocationRole(role);
  const showCarWashPicker = locationRole && !managerOnly;

  async function submit() {
    setErrorCode(null);
    const car_wash_id = locationRole ? carWashId || null : null;
    if (locationRole && !car_wash_id) {
      setErrorCode("members.car_wash_required");
      return;
    }
    try {
      if (mode === "edit" && member) {
        await onUpdate(member.membership_id, { role, car_wash_id });
        onOpenChange(false);
      } else {
        const res = await onInvite({ email: email.trim(), role, car_wash_id });
        setResult(res);
      }
    } catch (error) {
      setErrorCode(extractErrorCode(error) ?? "unknown");
    }
  }

  async function copyPassword() {
    if (!result?.temporary_password) return;
    await navigator.clipboard.writeText(result.temporary_password);
    setCopied(true);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {result
              ? t("inviteSentTitle")
              : mode === "edit"
                ? t("editTitle")
                : t("addTitle")}
          </DialogTitle>
          {!result ? (
            <DialogDescription>
              {mode === "edit" ? t("editHint") : t("addHint")}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {result ? (
          <div className="grid gap-3">
            {result.temporary_password ? (
              <>
                <p className="text-sm">
                  {t("tempPasswordNote", { email: result.member.email ?? "" })}
                </p>
                <div className="bg-muted flex items-center gap-2 rounded-lg p-3">
                  <KeyRound
                    size={16}
                    aria-hidden="true"
                    className="text-muted-foreground"
                  />
                  <code className="flex-1 font-mono text-sm break-all">
                    {result.temporary_password}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-9"
                    onClick={copyPassword}
                  >
                    {copied ? <Check /> : <Copy />}
                    {copied ? t("copied") : t("copy")}
                  </Button>
                </div>
                <p className="text-tone-amber-fg text-xs">
                  {t("tempPasswordWarning")}
                </p>
              </>
            ) : (
              <p className="text-sm">
                {t("attachedNote", { email: result.member.email ?? "" })}
              </p>
            )}
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                {t("done")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="grid gap-4">
            {mode === "invite" ? (
              <div className="grid gap-2">
                <Label htmlFor="member-email">{t("email")}</Label>
                <Input
                  id="member-email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  placeholder={t("emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            ) : (
              <p className="text-sm">
                <span className="font-medium">
                  {member?.full_name ?? member?.email}
                </span>
                {member?.full_name && member?.email ? (
                  <span className="text-muted-foreground font-mono">
                    {" "}
                    · {member.email}
                  </span>
                ) : null}
              </p>
            )}

            <div className="grid gap-2">
              <Label htmlFor="member-role">{t("role")}</Label>
              <Select
                value={role}
                onValueChange={(v) => v && setRole(v as Role)}
                disabled={managerOnly}
              >
                <SelectTrigger id="member-role" className="h-9 w-full">
                  <SelectValue>{(v) => tRoles(v as string)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((r) => (
                    <SelectItem key={r} value={r}>
                      {tRoles(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {showCarWashPicker ? (
              <div className="grid gap-2">
                <Label htmlFor="member-car-wash">{t("carWash")}</Label>
                <Select
                  value={carWashId}
                  onValueChange={(v) => v && setCarWashId(v)}
                >
                  <SelectTrigger id="member-car-wash" className="h-9 w-full">
                    <SelectValue placeholder={t("selectCarWash")}>
                      {(v) =>
                        carWashes.find((c) => c.id === v)?.name ??
                        t("selectCarWash")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {carWashes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {errorCode ? (
              <p className="text-destructive text-sm" role="alert">
                {resolveErrorMessage(toErrorTranslator(tErrors), errorCode)}
              </p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                {tCommon("cancel")}
              </Button>
              <Button type="button" onClick={submit} disabled={pending}>
                {mode === "edit" ? tCommon("save") : t("inviteCta")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
