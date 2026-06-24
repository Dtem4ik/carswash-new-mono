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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { hasAdminAccess } from "@/lib/admin-access";
import { useTenant } from "@/lib/tenant-context";

interface NavItem {
  key: "board" | "orders" | "shift" | "admin";
  href: string;
  icon: LucideIcon;
  /** Admin is capability-gated (manager+); a washer never sees it. */
  requiresAdmin?: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { key: "board", href: "/board", icon: LayoutGrid },
  { key: "orders", href: "/orders", icon: Receipt },
  { key: "shift", href: "/shift", icon: Timer },
  { key: "admin", href: "/admin", icon: Settings, requiresAdmin: true },
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
  const { hasCapability } = useTenant();
  const canAdmin = hasAdminAccess(hasCapability);

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
                if (item.requiresAdmin && !canAdmin) return null;
                const Icon = item.icon;
                const active =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);

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
