"use client";

import type { CarWash } from "@carswash/shared";
import { Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
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

  function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    startTransition(async () => {
      await setActiveCarWash(next);
      router.refresh();
    });
  }

  if (carWashes.length <= 1) {
    const only = carWashes[0];
    return (
      <span className="flex h-9 items-center gap-2 rounded-md px-1 text-sm">
        <Store size={16} aria-hidden="true" className="text-muted-foreground" />
        <span className="sr-only">{t("activeCarWash")}</span>
        <span className="font-medium">{only ? only.name : "—"}</span>
      </span>
    );
  }

  return (
    <label className="relative flex items-center">
      <Store
        size={16}
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute left-2.5"
      />
      <span className="sr-only">{t("activeCarWash")}</span>
      <select
        value={activeCarWashId ?? ""}
        onChange={onChange}
        disabled={pending}
        className="border-input bg-background hover:bg-muted focus-visible:ring-ring h-9 cursor-pointer rounded-md border pr-3 pl-8 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
      >
        {carWashes.map((cw) => (
          <option key={cw.id} value={cw.id}>
            {cw.name}
          </option>
        ))}
      </select>
    </label>
  );
}
