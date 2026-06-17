import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/shell/app-shell";
import { ACTIVE_CAR_WASH_COOKIE, fetchMe } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

// Reads the session + active car wash cookie and calls the API per request.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  if (!me) {
    const t = await getTranslations("shell");
    return (
      <main className="flex min-h-[100dvh] items-center justify-center p-8">
        <p className="text-destructive max-w-md text-center text-sm">
          {t("contextUnavailable")}
        </p>
      </main>
    );
  }

  return (
    <Providers me={me} userEmail={user.email ?? null}>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
