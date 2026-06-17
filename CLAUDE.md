# CarsWash — project guide for AI sessions

Multi-tenant SaaS for car-wash networks. 2026 rebuild (Next 16 + FastAPI + Supabase Postgres).
Read this, then the docs, before working.

## Source of truth (read first)
- `docs/ARCHITECTURE.md` — system design, three-level tenancy, money/time/i18n invariants, RLS.
- `docs/ROADMAP.md` — phased plan; find the phase you are executing.
- `docs/CONVENTIONS.md` — git workflow, Conventional Commits, code style, and the **AI Execution Protocol (§6)**.
- `docs/DB.md` — schema reference + tenancy/RLS explanation.
- `docs/UI.md` — binding UI/UX design-system standard for all frontend screens.
- `docs/ai/phase-*.md` — per-phase execution prompts and decisions (ADRs).

## Working agreement (non-negotiable)
- English for all code/comments/commits/docs; report to the owner in Russian. Conventional Commits (`db` is a **scope**, not a type).
- PR-based on a protected `main`; CI must be green. Branch per phase. **Stop at each phase boundary.**
- Invariants: money = `BIGINT *_amount_minor` (never float) + currency snapshotted from the car wash; time = `timestamptz` UTC, displayed in the car wash IANA timezone at the edge; PK = `uuid`; native Postgres enums = codes only (no localized prose); tenant scoping on every operational query (org or car wash via `X-Car-Wash-Id`, validated against `accessible_car_wash_ids`).
- The FastAPI OpenAPI schema is the contract; the web client is **generated** into `packages/shared` (`pnpm run openapi:generate`) — never hand-write API types.

## Environment
- `apps/api/.env` (git-ignored) holds Supabase vars by their provided names: `POSTGRES_URL` (pooled, runtime), `POSTGRES_URL_NON_POOLING` (direct, for Alembic), `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`. Do NOT invent `DATABASE_URL`/`DIRECT_URL`.
- `apps/web/.env.local` (git-ignored) holds `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`.
- Toolchain via `mise` (Node 24, pnpm 11, Python 3.13, uv). Commands: `mise exec -- uv run --directory apps/api ...`, `mise exec -- pnpm ...`.
- Migrations are applied directly to the live Supabase DB during each phase; merging a PR does NOT run migrations (deploy-time migration wiring is Phase 7).

## Project-specific gotchas (learned the hard way — do not repeat)
- **Auth / JWT:** the Supabase project signs tokens with **ES256 (asymmetric)** → verify via **JWKS** (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`, cached) as the primary path; HS256 via `SUPABASE_JWT_SECRET` is the fallback / used in tests. Detect the alg from the token header.
- **Next 16:** `middleware` is renamed to **`proxy`**. Auth/session refresh + route guards live there.
- **asyncpg:** `POSTGRES_URL` carries libpq params (e.g. `sslmode`) that asyncpg rejects — strip them when building the async URL. SQLAlchemy async needs **greenlet**. Alembic uses the sync **psycopg** driver over `POSTGRES_URL_NON_POOLING` (never the pooler for DDL).
- **Alembic enums:** `sa.Enum(create_type=False)` inside `op.create_table` still creates the type. Only issue a manual `CREATE TYPE` for enums used in `add_column`; otherwise you get duplicate-type errors. Each migration needs a working upgrade AND downgrade; `alembic check` must show no drift.
- **Tests run against the live Supabase pooler** (gated on DB/secret presence; CI has no secrets so DB tests skip → CI green). Running the **whole** DB suite in one process opens ~50 pooled connections and occasionally flakes (`asyncpg`/`OperationalError`) — run suites individually when verifying. Tests use rollback transactions, so they don't pollute data.
- **Capability gating:** enforce via FastAPI route `dependencies=[Depends(require_capability(...))]`; the matrix maps role → actions. Reads allowed in-scope; writes gated. `washer` is read-only in the web MVP; order/shift/payment mutations are `manager`/`org_admin`/`owner`.
- **Realtime:** the web subscribes to Supabase Realtime on `orders`/`boxes`, gated by RLS; tables must be in the `supabase_realtime` publication with `REPLICA IDENTITY FULL`.
- **Lint:** ruff UP047 → use PEP 695 generics.

## Demo data (dev only — never commit credentials)
Seed creates one org "CarsWash Demo" with two car washes (Almaty Central, Aqtobe West, both KZT) and three users (owner / manager / washer @carswash-demo.com). The manager and washer are bound to Almaty Central; the owner is org-level.
