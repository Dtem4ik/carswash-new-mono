# CarsWash

Multi-tenant SaaS for managing car-wash networks: a live boxes board, order
intake with queue, shifts, role-based access, per-car-type pricing, and
cross-location analytics for network owners.

> A 2026 rebuild of an older Nuxt 2 / Express / MySQL product. We keep the
> domain concept and rebuild on a modern, locale-agnostic, type-safe stack.

**Status:** Phase 0 complete — runnable monorepo with tooling, gates, and CI.

## Highlights

- **Three-level tenancy:** organization (network) → car washes (locations) →
  users with org- or location-scoped roles. Owners roll up analytics across all
  their car washes; locations stay operationally isolated.
- **Locale / currency / timezone independent.** Full i18n (next-intl), currency
  set per organization, timestamps in UTC displayed per car-wash timezone. Money
  is always integer minor units + ISO currency code — never a float.
- **Type-safe contract.** FastAPI OpenAPI is the source of truth; the web client
  is generated, never hand-written.
- **Realtime board** via Supabase Realtime, gated by Postgres RLS.

## Stack

- **Web:** Next 16 (App Router, TS), Tailwind v4 + shadcn/ui, TanStack Query,
  React Hook Form + Zod, next-intl.
- **API:** Python 3.13+, FastAPI, SQLAlchemy 2.0 (async) + Alembic, Pydantic v2.
- **Data:** Supabase Postgres (Auth + Realtime + RLS).
- **Tooling:** mise, pnpm workspaces, uv, Biome, Ruff + mypy, Lefthook,
  commitlint, GitHub Actions.

## Repository layout

```
apps/
  web/        # Next 16 frontend
  api/        # FastAPI backend
  # mobile/   # Expo washer app      (post-MVP)
  # ml/       # FastAPI + CV (ANPR)  (post-MVP)
packages/
  shared/     # generated API types + shared constants
docs/         # architecture, roadmap, conventions
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design, data model, tenancy, i18n.
- [docs/ROADMAP.md](docs/ROADMAP.md) — the phased plan (start here to build).
- [docs/CONVENTIONS.md](docs/CONVENTIONS.md) — git, commits, code style, AI execution protocol.

## Getting started

### Prerequisites

Install [mise](https://mise.jdx.dev/), which pins and provisions every tool
(Node 24, pnpm 11, Python 3.13, uv) from `mise.toml`:

```bash
curl https://mise.run | sh        # one-time mise install
mise install                      # provision Node, pnpm, Python, uv
```

### Install dependencies

```bash
pnpm install                      # JS workspace (web, shared) + git hooks
uv sync --directory apps/api      # Python deps for the API
```

### Run the apps

```bash
pnpm dev:web                      # Next.js → http://localhost:3000
pnpm dev:api                      # FastAPI → http://127.0.0.1:8000
```

- API health check: `GET /health` → `{"status": "ok"}`
- API docs (Swagger): http://127.0.0.1:8000/docs

Copy the env templates before configuring real services:

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
```

### Quality gate

Lefthook runs Biome and Ruff on staged files at commit time; commitlint
enforces Conventional Commits. To run the full gate manually:

```bash
pnpm lint                         # Biome (web + shared)
pnpm typecheck                    # tsc --noEmit (web + shared)
pnpm build:web                    # next build
pnpm lint:api                     # ruff check
pnpm format:api:check             # ruff format --check
pnpm typecheck:api                # mypy (strict)
pnpm test:api                     # pytest
```

## Conventions

All code, commits, and docs are in English and follow
[Conventional Commits](https://www.conventionalcommits.org/). See
[docs/CONVENTIONS.md](docs/CONVENTIONS.md).

## License

Proprietary — all rights reserved (subject to change).
