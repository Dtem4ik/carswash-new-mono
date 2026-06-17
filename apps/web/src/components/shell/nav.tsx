"use client";

import {
  Gear,
  type Icon,
  Receipt,
  SquaresFour,
  Timer,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface NavItem {
  key: "board" | "orders" | "shift" | "admin";
  href: string;
  icon: Icon;
  /** Board ships in Phase 4a; the rest land in 4b/4c and are disabled for now. */
  enabled: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { key: "board", href: "/board", icon: SquaresFour, enabled: true },
  { key: "orders", href: "/orders", icon: Receipt, enabled: false },
  { key: "shift", href: "/shift", icon: Timer, enabled: false },
  { key: "admin", href: "/admin", icon: Gear, enabled: false },
];

/** Primary navigation, shared by the desktop sidebar and the mobile drawer. */
export function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav aria-label={t("sectionLabel")} className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        if (!item.enabled) {
          return (
            <span
              key={item.key}
              aria-disabled="true"
              className="text-muted-foreground/55 flex min-h-11 cursor-not-allowed items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-medium select-none"
            >
              <span className="flex items-center gap-3">
                <Icon size={18} weight="regular" />
                {t(item.key)}
              </span>
              <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase">
                {t("comingSoon")}
              </span>
            </span>
          );
        }

        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon size={18} weight={active ? "fill" : "regular"} />
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
