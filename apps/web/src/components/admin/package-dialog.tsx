"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Service } from "@/hooks/use-catalog";
import {
  extractErrorCode,
  resolveErrorMessage,
  toErrorTranslator,
} from "@/lib/errors";

export interface PackageValues {
  name: string;
  serviceIds: string[];
}

/**
 * Create/edit dialog for a package: its name plus the set of (active) services
 * bundled into it (the PUT packages/{id}/services membership). Re-seeds from the
 * initial values each time it opens; surfaces an API error code inline.
 */
export function PackageDialog({
  open,
  onOpenChange,
  title,
  initial,
  services,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  initial: PackageValues;
  services: Service[];
  pending: boolean;
  onSubmit: (values: PackageValues) => Promise<void>;
}) {
  const t = useTranslations("admin");
  const tPackages = useTranslations("admin.packages");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");

  const [name, setName] = useState(initial.name);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initial.serviceIds),
  );
  const [nameError, setNameError] = useState(false);
  const [rootError, setRootError] = useState<string | null>(null);

  // Re-seed on open only — `initial` is a fresh object each render and would
  // otherwise clobber in-progress edits.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-seed on open only
  useEffect(() => {
    if (open) {
      setName(initial.name);
      setSelected(new Set(initial.serviceIds));
      setNameError(false);
      setRootError(null);
    }
  }, [open]);

  function toggle(serviceId: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(serviceId);
      else next.delete(serviceId);
      return next;
    });
  }

  async function submit() {
    const trimmed = name.trim();
    if (trimmed === "") {
      setNameError(true);
      return;
    }
    setRootError(null);
    try {
      await onSubmit({ name: trimmed, serviceIds: [...selected] });
      onOpenChange(false);
    } catch (error) {
      setRootError(
        resolveErrorMessage(
          toErrorTranslator(tErrors),
          extractErrorCode(error) ?? "unknown",
        ),
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="package-name">{t("name")}</Label>
            <Input
              id="package-name"
              autoFocus
              placeholder={t("namePlaceholder")}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(false);
              }}
            />
            {nameError ? (
              <p className="text-destructive text-sm">{t("nameRequired")}</p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <span className="text-sm font-medium">
              {tPackages("includedServices")}
            </span>
            <p className="text-muted-foreground text-sm">
              {tPackages("includedServicesHint")}
            </p>
            {services.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {tPackages("noServicesAvailable")}
              </p>
            ) : (
              <div className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border p-1">
                {services.map((service) => {
                  const id = `package-svc-${service.id}`;
                  return (
                    <Label
                      key={service.id}
                      htmlFor={id}
                      className="hover:bg-muted flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 font-normal"
                    >
                      <Checkbox
                        id={id}
                        checked={selected.has(service.id)}
                        onCheckedChange={(checked) =>
                          toggle(service.id, checked === true)
                        }
                      />
                      <span>{service.name}</span>
                    </Label>
                  );
                })}
              </div>
            )}
          </div>

          {rootError ? (
            <p className="text-destructive text-sm" role="alert">
              {rootError}
            </p>
          ) : null}
        </div>

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
            {pending ? t("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
