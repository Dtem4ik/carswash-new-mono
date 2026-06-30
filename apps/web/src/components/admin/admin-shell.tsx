"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { hasAdminAccess } from "@/lib/admin-access";
import { useTenant } from "@/lib/tenant-context";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "services", href: "/admin/services" },
  { key: "packages", href: "/admin/packages" },
  { key: "carTypes", href: "/admin/car-types" },
  { key: "prices", href: "/admin/prices" },
  { key: "boxes", href: "/admin/boxes" },
  // Staff management is gated separately — only roles that can manage users.
  { key: "staff", href: "/admin/staff", capability: "users.manage" },
] as const;

/**
 * Admin section frame: a heading, a route-based tab strip, and the active
 * sub-section. Gated to roles that can manage pricing/boxes/catalog — a washer
 * (read-only) gets a clear no-access panel instead of the tools.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations("admin");
  const tTabs = useTranslations("admin.tabs");
  const pathname = usePathname();
  const { hasCapability } = useTenant();

  if (!hasAdminAccess(hasCapability)) {
    return (
      <Card className="mx-auto flex max-w-md flex-col items-center gap-3 p-8 text-center">
        <span
          aria-hidden="true"
          className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full"
        >
          <Lock size={20} />
        </span>
        <h1 className="text-lg font-semibold tracking-tight">
          {t("noAccessTitle")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("noAccessHint")}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>

      <nav
        aria-label={t("title")}
        className="bg-muted text-muted-foreground inline-flex max-w-full gap-1 overflow-x-auto rounded-lg p-[3px]"
      >
        {TABS.filter(
          (tab) => !("capability" in tab) || hasCapability(tab.capability),
        ).map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 shrink-0 items-center justify-center rounded-md px-3 text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "hover:text-foreground",
              )}
            >
              {tTabs(tab.key)}
            </Link>
          );
        })}
      </nav>

      <div>{children}</div>
    </div>
  );
}
