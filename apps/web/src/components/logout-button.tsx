"use client";

import { Button } from "@/components/ui/button";
import { t } from "@/lib/messages";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  async function onClick() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.assign("/login");
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      {t("auth.signOut")}
    </Button>
  );
}
