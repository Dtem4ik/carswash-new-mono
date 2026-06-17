"use client";

import { type ApiClient, createApiClient } from "@carswash/shared";
import { useMemo } from "react";
import { apiUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

/**
 * A typed API client for client components. A request middleware attaches the
 * live Supabase access token and the active car wash as `X-Car-Wash-Id`, so
 * every call is authenticated and tenant-scoped. The client is memoized per
 * active car wash; the token is read fresh on each request (it may rotate).
 */
export function useApiClient(activeCarWashId: string | null): ApiClient {
  return useMemo(() => {
    const supabase = createClient();
    const client = createApiClient(apiUrl());
    client.use({
      async onRequest({ request }) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.access_token) {
          request.headers.set(
            "Authorization",
            `Bearer ${session.access_token}`,
          );
        }
        if (activeCarWashId) {
          request.headers.set("X-Car-Wash-Id", activeCarWashId);
        }
        return request;
      },
    });
    return client;
  }, [activeCarWashId]);
}
