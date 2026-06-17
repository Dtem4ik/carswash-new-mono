# @carswash/shared

Shared TypeScript for the web: the **generated** OpenAPI client and shared
types/constants. API types are generated from the FastAPI OpenAPI schema and are
**never hand-written** (ARCHITECTURE.md §4).

## Generated client

- `openapi/schema.json` — the exported FastAPI OpenAPI document.
- `src/api/schema.ts` — types generated from it by `openapi-typescript`.
- `src/api/client.ts` — a typed [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/)
  client (`createApiClient`) plus convenience types (`MeResponse`, `CarWash`, `Role`).

Both generated files are committed so the web builds without running Python.

## Regenerate after changing the API

From the repo root, with the API's `.env` present (needs nothing but importable code):

```bash
pnpm run openapi:generate
```

This runs two steps:

1. `openapi:export` — `uv run --directory apps/api python -m app.export_openapi`
   writes `packages/shared/openapi/schema.json`.
2. `@carswash/shared generate:types` — `openapi-typescript` writes
   `src/api/schema.ts`.

Commit the regenerated files alongside the API change.
