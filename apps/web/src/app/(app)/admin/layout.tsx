import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";

// The admin section reads the active car wash + role per request like the rest
// of the (app) tree; the shell client-gates it to manager / org_admin / owner.
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
