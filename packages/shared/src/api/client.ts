/**
 * Typed API client, generated-types-first.
 *
 * `schema.ts` is generated from the FastAPI OpenAPI document by
 * `openapi-typescript` (see the package `generate:types` script). This module
 * pairs it with `openapi-fetch` for a fully typed runtime client. The web never
 * hand-writes API types — it imports them from here.
 */

import createClient, { type Client } from "openapi-fetch";
import type { paths } from "./schema";

export type ApiClient = Client<paths>;

/** Create a typed API client bound to `baseUrl` (e.g. NEXT_PUBLIC_API_URL). */
export function createApiClient(baseUrl: string): ApiClient {
  return createClient<paths>({ baseUrl });
}

/** The `GET /me` 200 response — the resolved tenant context. */
export type MeResponse =
  paths["/me"]["get"]["responses"][200]["content"]["application/json"];

/** A car wash entry from `GET /me`. */
export type CarWash = MeResponse["accessible_car_washes"][number];

/** Membership role code returned by the API. */
export type Role = MeResponse["role"];
