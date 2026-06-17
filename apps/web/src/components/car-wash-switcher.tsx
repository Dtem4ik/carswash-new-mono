"use client";

import type { CarWash } from "@carswash/shared";
import { useRouter } from "next/navigation";
import { setActiveCarWash } from "@/lib/actions";
import { t } from "@/lib/messages";

interface Props {
  carWashes: CarWash[];
  activeCarWashId: string | null;
}

/**
 * Selects the active car wash. The choice is persisted in a cookie via a server
 * action, which the server reads and forwards to the API as X-Car-Wash-Id.
 * Single-wash users see a fixed label instead of a selector.
 */
export function CarWashSwitcher({ carWashes, activeCarWashId }: Props) {
  const router = useRouter();

  async function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    await setActiveCarWash(event.target.value);
    router.refresh();
  }

  if (carWashes.length <= 1) {
    const only = carWashes[0];
    return (
      <span className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">
          {t("dashboard.activeCarWash")}
        </span>
        <span className="font-medium">{only ? only.name : "—"}</span>
      </span>
    );
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">
        {t("dashboard.activeCarWash")}
      </span>
      <select
        value={activeCarWashId ?? ""}
        onChange={onChange}
        className="border-input bg-background rounded-md border px-2 py-1 text-sm"
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
