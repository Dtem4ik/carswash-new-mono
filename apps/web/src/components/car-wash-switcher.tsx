"use client";

import type { CarWash } from "@carswash/shared";
import { Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setActiveCarWash } from "@/lib/actions";

interface Props {
  carWashes: CarWash[];
  activeCarWashId: string | null;
}

/**
 * Selects the active car wash. The choice is persisted in a cookie via a server
 * action, which the server reads and forwards to the API as X-Car-Wash-Id;
 * client API calls pick it up from the tenant context. Single-wash users see a
 * fixed label instead of a selector.
 */
export function CarWashSwitcher({ carWashes, activeCarWashId }: Props) {
  const t = useTranslations("shell");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onValueChange(next: string | null) {
    if (next == null) return;
    startTransition(async () => {
      await setActiveCarWash(next);
      router.refresh();
    });
  }

  if (carWashes.length <= 1) {
    const only = carWashes[0];
    return (
      <span className="flex h-9 items-center gap-2 rounded-lg px-1 text-sm">
        <Store size={16} aria-hidden="true" className="text-muted-foreground" />
        <span className="sr-only">{t("activeCarWash")}</span>
        <span className="font-medium">{only ? only.name : "—"}</span>
      </span>
    );
  }

  return (
    <Select
      value={activeCarWashId ?? ""}
      onValueChange={onValueChange}
      disabled={pending}
    >
      <SelectTrigger className="h-9" aria-label={t("activeCarWash")}>
        <Store size={16} aria-hidden="true" className="text-muted-foreground" />
        <SelectValue>
          {(value) => carWashes.find((cw) => cw.id === value)?.name ?? "—"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {carWashes.map((cw) => (
          <SelectItem key={cw.id} value={cw.id}>
            {cw.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
