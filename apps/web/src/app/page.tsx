import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CarWashSwitcher } from "@/components/car-wash-switcher";
import { LogoutButton } from "@/components/logout-button";
import { ACTIVE_CAR_WASH_COOKIE, fetchMe } from "@/lib/api";
import { t } from "@/lib/messages";
import { createClient } from "@/lib/supabase/server";

// Reads the session cookie and calls the API per request — always dynamic.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const cookieStore = await cookies();
  const activeCarWash = cookieStore.get(ACTIVE_CAR_WASH_COOKIE)?.value;
  const me = session
    ? await fetchMe(session.access_token, activeCarWash)
    : null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <span className="text-lg font-semibold tracking-tight">
          {t("app.name")}
        </span>
        <div className="flex items-center gap-4">
          {me ? (
            <CarWashSwitcher
              carWashes={me.accessible_car_washes}
              activeCarWashId={me.active_car_wash_id}
            />
          ) : null}
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("dashboard.title")}
        </h1>

        {me ? (
          <div className="space-y-6">
            <section className="space-y-1">
              <p className="text-muted-foreground text-sm">
                {me.organization.name}
              </p>
              <p className="text-sm">
                {me.user.full_name ?? user.email} ·{" "}
                <strong>{t("dashboard.role")}:</strong>{" "}
                <span className="font-mono">{me.role}</span>
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-medium">
                {t("dashboard.accessibleCarWashes")}
              </h2>
              <ul className="divide-y rounded-lg border">
                {me.accessible_car_washes.map((cw) => (
                  <li
                    key={cw.id}
                    className="flex items-center justify-between px-4 py-2 text-sm"
                  >
                    <span>{cw.name}</span>
                    <span className="text-muted-foreground font-mono text-xs">
                      {cw.currency} · {cw.timezone}
                      {cw.id === me.active_car_wash_id ? " · active" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-medium">
                {t("dashboard.capabilities")}
              </h2>
              <div className="flex flex-wrap gap-2">
                {me.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="bg-muted rounded-md px-2 py-1 font-mono text-xs"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <p className="text-destructive text-sm">
            {t("dashboard.contextUnavailable")}
          </p>
        )}
      </main>
    </div>
  );
}
