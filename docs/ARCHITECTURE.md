# Architecture

> Status: living document. Last updated at project bootstrap.
> Audience: humans and AI agents building this system. Read this before writing code.

CarsWash is a multi-tenant SaaS for managing car-wash networks. It is the
2026 re-imagining of an older product (Nuxt 2 + Express + MySQL). We keep the
**domain concept** (boxes, orders, queue, shifts, washers, pricing) and rebuild
everything else on a modern, locale-agnostic, type-safe stack.

---

## 1. Core principles

These are non-negotiable. Every phase must respect them.

1. **Locale / currency / timezone independence.** The system is not bound to any
   country, language, or timezone. See §8.
2. **Canonical data in, localized data out.** The backend stores and returns
   canonical values (UTC timestamps, minor-unit integer money + ISO currency
   code, stable enum/error codes). Human-facing text is localized only at the
   presentation edge (web/mobile).
3. **Tenant isolation by construction.** Operational data of one car wash never
   leaks into another. Enforced in the app layer (FastAPI) and, for client-side
   realtime reads, by Postgres RLS. See §3 and §6.
4. **One source of truth for types.** The FastAPI OpenAPI schema is the contract.
   The web/mobile TypeScript clients are generated from it — never hand-written.
5. **Money is never a float.** Integer minor units + currency code. Always.
6. **Time is always UTC in storage.** Displayed in the relevant car wash's
   timezone at the edge.
7. **Reversible decisions stay reversible.** No vendor API leaks into domain
   logic. Supabase/Vercel are infrastructure, swappable for self-hosted Postgres
   + a container host (see §9).

---

## 2. High-level topology

```
                         ┌─────────────────────────┐
                         │  Web (Next 16, Vercel)  │
   browser ─────────────▶│  - admin & operator UI  │
                         │  - i18n, charts          │
                         └───────┬─────────┬────────┘
                                 │ REST    │ Realtime (subscribe)
                                 │ (typed) │
                 ┌───────────────▼──┐   ┌──▼───────────────────────┐
                 │ API (FastAPI)    │   │ Supabase Realtime         │
                 │ - business logic │   │ - postgres_changes        │
                 │ - tenant scoping │   │ - gated by RLS            │
                 │ - OpenAPI        │   └──┬────────────────────────┘
                 └───────┬──────────┘      │
                         │ SQLAlchemy      │
                 ┌───────▼─────────────────▼────────────────────────┐
                 │ Supabase Postgres (Frankfurt)                     │
                 │ - schema + Alembic migrations                     │
                 │ - RLS policies (realtime-exposed tables)          │
                 │ - Supabase Auth (auth.users) for email/password   │
                 └───────────────────────────────────────────────────┘

Future: apps/mobile (Expo, REST client) · apps/ml (FastAPI + CV, ANPR)
```

**Read/write split (MVP):**

- **Writes & business reads** (create order, close order, lists, stats):
  Web → FastAPI (REST). FastAPI verifies the Supabase JWT, derives tenant
  context, enforces scoping, talks to Postgres.
- **Live board reads** (boxes/orders changing in real time): Web subscribes to
  Supabase Realtime directly, scoped to a `car_wash_id`; RLS guarantees a user
  only receives rows for car washes they belong to.

---

## 3. Tenancy model (three levels)

The owner of a car-wash network is the top tenant. Locations under it are
operationally isolated, but the owner can roll up analytics across all of them.

```
organization  (the network / owner account; holds currency, default locale, plan)
   └── car_wash  (a physical location; holds its own timezone)
          ├── boxes
          ├── shifts
          ├── orders ─ order_services
          ├── services / packages / pricing
          └── clients / cars  (network-shared registry, see §5)

users  (one identity) ── memberships ──┐
                                        ├── org-level role  (owner / org_admin)  → all car washes + cross-wash stats
                                        └── location role   (manager / washer)   → a single car wash
```

### `memberships`

A single, flexible link table:

| column            | meaning                                                            |
|-------------------|--------------------------------------------------------------------|
| `user_id`         | references `auth.users`                                             |
| `organization_id` | always set                                                         |
| `car_wash_id`     | **nullable**. NULL = org-wide membership (owner/org_admin)         |
| `role`            | enum: `owner`, `org_admin`, `manager`, `washer`                    |

- `car_wash_id IS NULL` + role `owner`/`org_admin` ⇒ access to **every** car
  wash in the organization, plus cross-wash analytics.
- `car_wash_id` set + role `manager`/`washer` ⇒ scoped to that one location.

### Tenant context

Every authenticated request resolves a **TenantContext**:

```
TenantContext = {
  user_id,
  organization_id,
  accessible_car_wash_ids: [...],   // all, if org-level; one, if location-level
  role,
  active_car_wash_id,               // the location currently being operated on
}
```

A FastAPI dependency builds this from the JWT + `memberships` and injects it
into every handler. **No query touches operational tables without it.**

---

## 4. Authentication & authorization

- **Authentication:** Supabase Auth, email + password (MVP). Supabase issues a
  JWT. The web app holds the session via the Supabase JS client.
- **API auth:** FastAPI verifies the Supabase JWT (signature + claims) on every
  request via a dependency. It extracts `sub` (auth user id), then loads
  `memberships` to build the `TenantContext`.
- **Authorization:** role-based capability checks in the app layer. A small
  capability matrix maps `role → allowed actions` (e.g. only `manager`/`owner`
  may close an order or edit pricing). Granular per-permission flags (like the
  old `cw_finish_order`) are a post-MVP refinement.

> Phone/SMS-OTP login and granular permissions are explicitly deferred. The auth
> module is isolated so swapping/extending the method later is local.

---

## 5. Data model (MVP)

Canonical, normalized, locale-agnostic. Names below are illustrative; final
column names are fixed in the Alembic migrations (Phase 1).

**Tenancy & identity**
- `organizations` — `id`, `name`, `currency` (ISO 4217), `default_locale`,
  `plan`, `created_at`.
- `car_washes` — `id`, `organization_id`, `name`, `timezone` (IANA, e.g.
  `Asia/Almaty`), `address`, `is_active`.
- `profiles` — mirror of `auth.users`: `id`, `full_name`, `locale`, `avatar_url`.
- `memberships` — see §3.

**Catalog / pricing**
- `car_types` — body classes (sedan, SUV, …); per-organization.
- `services` — service definitions; per-organization.
- `service_prices` — `service_id` × `car_type_id` → `amount_minor`. Per car wash
  (or per org with overrides — decided in Phase 1).
- `packages`, `package_services`, `package_prices` — bundles by car type.

**Operations**
- `boxes` — `id`, `car_wash_id`, `name`, `status` (`free` | `busy`), `active_order_id`.
- `shifts` — `id`, `car_wash_id`, `opened_by`, `opened_at`, `closed_at` (UTC).
- `clients` — `id`, `organization_id`, `name`, `phone`.
- `cars` — `id`, `plate`, `car_type_id`, `model`/`brand` (free text MVP).
- `client_cars` — link.
- `orders` — `id`, `car_wash_id`, `box_id`, `shift_id`, `client_car_id`,
  `status` (`queued` | `in_progress` | `done` | `cancelled`),
  `price_amount_minor`, `currency`, `discount_pct`, `created_by`,
  `started_at`, `finished_at` (UTC), `package_id` (nullable).
- `order_services` — `order_id`, `service_id`, `unit_amount_minor`, `qty`.

**Money rule:** any monetary column is `*_amount_minor` (BIGINT) and always
travels with a `currency` (inherited from the organization). Never a float,
never a bare number.

**Status model:** box status is derived from its active order; order status is
the source of truth. Queue = orders with status `queued` for a busy box; closing
the active order promotes the next `queued` order (the old app's behavior,
cleaned up).

---

## 6. Tenant isolation enforcement

Two complementary layers:

1. **App layer (primary).** Every repository function requires a `TenantContext`
   and filters by `car_wash_id ∈ accessible_car_wash_ids` (and
   `organization_id`). This is the main guarantee for all REST traffic.
2. **Postgres RLS (for realtime).** Tables the web subscribes to directly
   (`orders`, `boxes`) carry RLS policies that gate rows by the requesting
   Supabase user's memberships, via a `SECURITY DEFINER` helper function
   (`auth_user_car_wash_ids()`). This makes the realtime channel safe without
   routing it through the API.

> Full RLS coverage of all tables (defense-in-depth for the API path too) is a
> hardening task in Phase 6.

---

## 7. Realtime strategy

- The live boxes board and order queue update via **Supabase Realtime**
  (`postgres_changes` on `orders` and `boxes`), filtered client-side by
  `car_wash_id` and gated server-side by RLS.
- FastAPI does **not** manage websockets. This removes the entire hand-rolled
  Socket.io layer of the old app and keeps the API stateless and serverless-friendly.
- Optimistic UI on the client + realtime reconciliation.

---

## 8. Internationalization & localization

First-class, from day one. The system must run for any country/language/currency.

**Language (i18n)**
- Web uses `next-intl` (App Router). Message catalogs per locale under
  `apps/web/messages/{en,ru,kk}.json`; the locale set is extensible by adding a
  file — no code changes.
- The API returns **stable codes**, never localized prose: enum values
  (`order.status = "queued"`), and machine error codes
  (`error.code = "shift.not_open"`). The web maps codes → localized strings.
- Validation errors carry field + code, not a sentence.

**Currency**
- Set on the `organization` (owner account). Stored as ISO 4217 code.
- All amounts are integer minor units. Formatting happens on the edge with
  `Intl.NumberFormat(locale, { style: 'currency', currency })`.

**Time**
- All timestamps stored as `timestamptz` in **UTC**.
- Each `car_wash` has an IANA `timezone`. Display and "today/this shift"
  boundaries are computed in the car wash's timezone at the edge.
- Never store or compare naive local times.

**Tenant-authored text**
- Service/package names are content authored by the tenant and stored as
  entered (single language for MVP). A translations table for tenant content is
  a post-MVP option.

---

## 9. Deployment topology

| Component | MVP host | Portability path |
|-----------|----------|------------------|
| Web (Next) | Vercel | any Node host / container |
| API (FastAPI) | Vercel (zero-config Python) | Dockerfile shipped → Fly/Railway/own VPS |
| Postgres | Supabase (Frankfurt) | `pg_dump` → self-hosted Postgres; or self-host full Supabase via Docker |
| Auth | Supabase Auth | self-host GoTrue, or swap to Auth.js/custom |
| Realtime | Supabase Realtime | self-host, or Postgres LISTEN/NOTIFY |

Domain logic depends only on a Postgres connection string and the OpenAPI
contract — not on Supabase SDKs — so moving to a VPS is an env + infra change,
not a rewrite.

---

## 10. Stack summary

**Web** — Next 16 (App Router, TS), Tailwind CSS v4 + shadcn/ui, TanStack Query,
React Hook Form + Zod, next-intl, Supabase JS (auth + realtime only), generated
OpenAPI client, Recharts/Tremor for charts.

**API** — Python 3.13+, FastAPI, Uvicorn, SQLAlchemy 2.0 (async) + Alembic,
Pydantic v2 + pydantic-settings, pytest + httpx.

**Shared** — `packages/shared`: generated TS types from OpenAPI + shared
enums/constants.

**Tooling** — `mise` (tool versions), `pnpm` workspaces (JS), `uv` (Python),
Biome (TS lint/format), Ruff + mypy (Python), Lefthook (git hooks),
commitlint (Conventional Commits), GitHub Actions (CI).

**Repo layout**

```
carswash/
  apps/
    web/        # Next 16
    api/        # FastAPI
    # mobile/   # Expo            (post-MVP)
    # ml/       # FastAPI + CV    (post-MVP)
  packages/
    shared/     # generated types + shared constants
  docs/         # this folder
  .github/      # CI
```

---

## 11. Out of scope for MVP (planned later)

CRM integrations (Bitrix24 in/out webhooks + public partner API), online
booking, push notifications, the Expo washer app, and the AI/ANPR ML service.
Each has a dedicated post-MVP phase in `ROADMAP.md`. The architecture leaves
clean seams for all of them.
