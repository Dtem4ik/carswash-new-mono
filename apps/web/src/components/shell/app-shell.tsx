"use client";

import { Droplet } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { CarWashSwitcher } from "@/components/car-wash-switcher";
import { LanguageSwitcher } from "@/components/language-switcher";
import { LogoutButton } from "@/components/logout-button";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useTenant } from "@/lib/tenant-context";

/**
 * Authenticated app shell per docs/UI.md: a collapsible (icon) shadcn sidebar
 * plus a header with the trigger, the brand mark + org, the car-wash switcher,
 * the language switcher, the theme toggle, and the signed-in user with logout.
 * The sidebar's open/collapsed state is persisted (cookie) and read on the
 * server as `defaultOpen`, so there is no flash on reload.
 */
export function AppShell({
  defaultSidebarOpen,
  children,
}: {
  defaultSidebarOpen: boolean;
  children: ReactNode;
}) {
  const { me, role, userEmail } = useTenant();
  const tApp = useTranslations("app");
  const tRoles = useTranslations("roles");

  const userName = me.user.full_name ?? userEmail ?? "—";

  return (
    <TooltipProvider delay={0}>
      <SidebarProvider defaultOpen={defaultSidebarOpen}>
        <AppSidebar />
        <SidebarInset>
          <header className="bg-card/85 supports-[backdrop-filter]:bg-card/70 sticky top-0 z-30 border-b backdrop-blur">
            <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
              <SidebarTrigger className="size-9" />

              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-xl shadow-sm"
                >
                  <Droplet size={20} />
                </span>
                <div className="flex min-w-0 flex-col leading-tight">
                  <span className="text-base font-semibold tracking-tight">
                    {tApp("name")}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {me.organization.name}
                  </span>
                </div>
              </div>

              <div className="ml-auto flex items-center gap-2 sm:gap-3">
                <div className="hidden sm:block">
                  <CarWashSwitcher
                    carWashes={me.accessible_car_washes}
                    activeCarWashId={me.active_car_wash_id}
                  />
                </div>
                <LanguageSwitcher />
                <ThemeToggle />
                <div className="hidden flex-col items-end leading-tight md:flex">
                  <span className="max-w-[14rem] truncate text-sm font-medium">
                    {userName}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {tRoles(role)}
                  </span>
                </div>
                <LogoutButton />
              </div>
            </div>

            {/* Switcher drops below the header on the narrowest screens. */}
            <div className="border-t px-4 py-2 sm:hidden">
              <CarWashSwitcher
                carWashes={me.accessible_car_washes}
                activeCarWashId={me.active_car_wash_id}
              />
            </div>
          </header>

          <div className="min-w-0 flex-1 p-4 sm:p-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
