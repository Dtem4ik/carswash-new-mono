"use client";

import type { MeResponse } from "@carswash/shared";
import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { createQueryClient } from "@/lib/query-client";
import { TenantProvider } from "@/lib/tenant-context";

/** Client providers for the authenticated app: TanStack Query + tenant context. */
export function Providers({
  me,
  userEmail,
  children,
}: {
  me: MeResponse;
  userEmail: string | null;
  children: ReactNode;
}) {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <TenantProvider me={me} userEmail={userEmail}>
        {children}
      </TenantProvider>
      <Toaster />
    </QueryClientProvider>
  );
}
