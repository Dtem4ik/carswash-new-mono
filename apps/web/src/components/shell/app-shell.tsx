"use client";

import { Drop, List, X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { CarWashSwitcher } from "@/components/car-wash-switcher";
import { LanguageSwitcher } from "@/components/language-switcher";
import { LogoutButton } from "@/components/logout-button";
import { Nav } from "@/components/shell/nav";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/lib/tenant-context";

/**
 * Authenticated app shell per docs/UI.md: a left nav (collapsing to a drawer on
 * small screens) plus a header with the org, the car-wash switcher, the language
 * switcher, and the signed-in user with logout.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { me, role, userEmail } = useTenant();
  const tApp = useTranslations("app");
  const tShell = useTranslations("shell");
  const tRoles = useTranslations("roles");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const userName = me.user.full_name ?? userEmail ?? "—";

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="bg-card/85 supports-[backdrop-filter]:bg-card/70 sticky top-0 z-30 border-b backdrop-blur">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="size-11 lg:hidden"
            aria-label={tShell("openMenu")}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <List size={20} />
          </Button>

          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden="true"
              className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-xl shadow-sm"
            >
              <Drop size={20} weight="fill" />
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

      <div className="mx-auto flex w-full max-w-[1400px] flex-1">
        <aside className="hidden w-60 shrink-0 border-r p-4 lg:block">
          <Nav />
        </aside>

        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>

      {/* Mobile navigation drawer. */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={tShell("closeMenu")}
            className="bg-foreground/30 absolute inset-0"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="bg-background absolute inset-y-0 left-0 flex w-72 max-w-[80vw] flex-col gap-4 border-r p-4 shadow-md">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-xl shadow-sm"
                >
                  <Drop size={20} weight="fill" />
                </span>
                <span className="text-base font-semibold tracking-tight">
                  {tApp("name")}
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label={tShell("closeMenu")}
                onClick={() => setDrawerOpen(false)}
              >
                <X size={20} />
              </Button>
            </div>
            <Nav onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
