import { createApiClient, type MeResponse } from "@carswash/shared";
import { apiUrl } from "@/lib/env";

/** Cookie that holds the operator's chosen active car wash id. */
export const ACTIVE_CAR_WASH_COOKIE = "cw_active";

/**
 * Fetch the resolved tenant context from the API using the generated, fully
 * typed client. Returns null if the API is unreachable or rejects the token.
 */
export async function fetchMe(
  accessToken: string,
  activeCarWashId?: string,
): Promise<MeResponse | null> {
  const client = createApiClient(apiUrl());
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  if (activeCarWashId) headers["X-Car-Wash-Id"] = activeCarWashId;

  const { data, error } = await client.GET("/me", { headers });
  if (error || !data) return null;
  return data;
}
