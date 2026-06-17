"use client";

import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const t = useTranslations("common");

  async function onClick() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.assign("/login");
  }

  return (
    <Button variant="outline" size="sm" className="h-9" onClick={onClick}>
      <LogOut size={16} aria-hidden="true" />
      <span className="hidden sm:inline">{t("signOut")}</span>
    </Button>
  );
}
