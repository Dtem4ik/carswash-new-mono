"use client";

import type { MeResponse } from "@carswash/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
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
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TenantProvider me={me} userEmail={userEmail}>
        {children}
      </TenantProvider>
    </QueryClientProvider>
  );
}
