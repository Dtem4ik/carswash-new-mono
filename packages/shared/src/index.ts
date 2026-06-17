/**
 * @carswash/shared
 *
 * The generated OpenAPI client and shared enums/constants. API types are
 * generated from the FastAPI OpenAPI schema (`pnpm run openapi:generate` at the
 * repo root), never hand-written.
 */

export type { ApiClient, CarWash, MeResponse, Role } from "./api/client";
export { createApiClient } from "./api/client";
export type { components, paths } from "./api/schema";

/** Package marker (kept for compatibility / quick smoke checks). */
export const PACKAGE_NAME = "@carswash/shared";
