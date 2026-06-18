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
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

interface NavItem {
  key: "board" | "orders" | "shift" | "admin";
  href: string;
  icon: LucideIcon;
  /** Board/orders/shift ship in Phase 4a/4b; admin lands in 4c and stays disabled. */
  enabled: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { key: "board", href: "/board", icon: LayoutGrid, enabled: true },
  { key: "orders", href: "/orders", icon: Receipt, enabled: true },
  { key: "shift", href: "/shift", icon: Timer, enabled: true },
  { key: "admin", href: "/admin", icon: Settings, enabled: false },
];

/**
 * Primary navigation as a collapsible (icon) shadcn sidebar. Expanded shows
 * icon + label (+ a "soon" badge for disabled items); collapsed shows icon-only
 * with the localized label surfaced as a tooltip. On mobile it renders as a
 * sheet and closes on navigation.
 */
export function AppSidebar() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const { isMobile, setOpenMobile } = useSidebar();

  function handleNavigate() {
    if (isMobile) setOpenMobile(false);
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu aria-label={t("sectionLabel")}>
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);

                if (!item.enabled) {
                  return (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        aria-disabled="true"
                        tooltip={t(item.key)}
                        className="cursor-not-allowed opacity-60"
                      >
                        <Icon />
                        <span>{t(item.key)}</span>
                      </SidebarMenuButton>
                      <SidebarMenuBadge className="text-[10px] tracking-wide uppercase">
                        {t("comingSoon")}
                      </SidebarMenuBadge>
                    </SidebarMenuItem>
                  );
                }

                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      render={
                        <Link href={item.href} onClick={handleNavigate} />
                      }
                      isActive={active}
                      tooltip={t(item.key)}
                    >
                      <Icon />
                      <span>{t(item.key)}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
