"use client";

import {
  LayoutGrid,
  type LucideIcon,
  Receipt,
  Settings,
  Timer,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface NavItem {
  key: "board" | "orders" | "shift" | "admin";
  href: string;
  icon: LucideIcon;
  /** Board ships in Phase 4a; the rest land in 4b/4c and are disabled for now. */
  enabled: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { key: "board", href: "/board", icon: LayoutGrid, enabled: true },
  { key: "orders", href: "/orders", icon: Receipt, enabled: false },
  { key: "shift", href: "/shift", icon: Timer, enabled: false },
  { key: "admin", href: "/admin", icon: Settings, enabled: false },
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
              className="text-muted-foreground/55 flex min-h-11 cursor-not-allowed items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium select-none"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Icon size={18} className="shrink-0" />
                <span className="truncate">{t(item.key)}</span>
              </span>
              <Badge
                variant="secondary"
                className="shrink-0 text-[10px] tracking-wide uppercase"
              >
                {t("comingSoon")}
              </Badge>
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
              "flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon
              size={18}
              className={cn("shrink-0", active && "text-primary")}
            />
            <span className="truncate">{t(item.key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
