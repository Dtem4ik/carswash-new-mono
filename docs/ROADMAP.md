# Roadmap — the phased superplan

> Read `ARCHITECTURE.md` and `CONVENTIONS.md` first. This file is the execution
> plan. Each phase is self-contained: objective, scope, deliverables, acceptance
> criteria, a Conventional-Commit sequence, and a ready-to-use AI prompt.
>
> Execute **one phase at a time**. Do not start a phase before the previous one
> meets its Definition of Done.

## Phase overview

| # | Phase | Goal | Ships |
|---|-------|------|-------|
| 0 | Foundations | Monorepo, tooling, CI, docs, empty runnable apps | infra |
| 1 | Data model | Postgres schema, Alembic migrations, RLS, seed | db |
| 2 | Auth & tenancy | Supabase Auth, JWT verify, TenantContext, login | auth |
| 3 | Backend core API | Boxes, pricing, clients/cars, orders+queue, shifts, roles | api |
| 4 | Frontend core | Live board, order intake, lists, shifts, admin, i18n | web |
| 5 | Stats & dashboard | Per-wash + cross-wash (owner) analytics | stats |
| 6 | Hardening | RLS audit, e2e, a11y, errors, observability, security | quality |
| 7 | Deploy MVP | Vercel web+api, Supabase prod, smoke tests | **MVP** |
| 8+ | Post-MVP | CRM, booking, push, mobile (Expo), AI/ANPR | growth |

**MVP = Phases 0–7.**

---

## Phase 0 — Foundations

**Objective.** A clean polyglot monorepo where `web` and `api` each start and
say "hello", with all quality gates and conventions wired before any feature.

**Scope (in).** Repo layout, tool versions (`mise`), `pnpm` workspaces, `uv`
Python project, Biome, Ruff+mypy, Lefthook + commitlint, GitHub Actions CI,
`.env.example` files, root README, docs.

**Scope (out).** Any domain feature, DB schema, auth.

**Deliverables.**
- `mise.toml` pinning Node, pnpm, Python, uv.
- `pnpm-workspace.yaml`; `apps/web` (Next 16 + TS + Tailwind v4 + shadcn init);
  `packages/shared` stub.
- `apps/api` (`uv` project): FastAPI app with `GET /health` and OpenAPI on.
- Biome config; Ruff + mypy config; Lefthook config; commitlint config.
- CI: lint + type-check + test + build for both apps on PR.
- `.env.example` for web and api.

**Acceptance criteria.**
- `mise install` then documented dev commands start both apps locally.
- `GET /health` returns `{ "status": "ok" }`; `/docs` (Swagger) loads.
- Web renders a placeholder page.
- CI is green on a trivial PR. A non-conventional commit message is rejected.

**Commit sequence.**
```
chore(repo): initialize monorepo layout and tool versions
build(web): scaffold next 15 app with tailwind and shadcn
build(api): scaffold fastapi app with health endpoint
chore(repo): add biome, ruff, mypy, lefthook, commitlint
ci(repo): add lint, typecheck, test, build pipeline
docs(repo): add root readme and env examples
```

**AI prompt.**
> Execute Phase 0 from docs/ROADMAP.md. Set up the polyglot monorepo exactly as
> described in ARCHITECTURE.md §10. Use mise for tool versions, pnpm workspaces
> for JS, uv for the Python API. Wire Biome, Ruff, mypy, Lefthook, commitlint,
> and a GitHub Actions CI. Both apps must run and pass the gate. Follow the
> commit sequence. Do not add any domain feature. Report in Russian when done.

---

## Phase 1 — Data model

**Objective.** The full canonical schema with migrations, the tenancy tables,
RLS for realtime-exposed tables, and seed data for local development.

**Scope (in).** SQLAlchemy 2.0 models + Alembic for all MVP tables
(ARCHITECTURE §5); enums (`order_status`, `box_status`, `membership_role`);
money as `*_amount_minor` + `currency`; UTC `timestamptz`; org `currency` +
`default_locale`, car_wash `timezone`; RLS policies + `auth_user_car_wash_ids()`
helper on `orders` and `boxes`; idempotent seed script (1 org, 2 car washes,
car types, services + prices, boxes, demo users/memberships).

**Scope (out).** API endpoints, auth verification logic (just the schema).

**Deliverables.**
- `apps/api/.../models/*.py`, Alembic env + first migration.
- `migrations/` with RLS policies and the security-definer helper.
- `scripts/seed.py` (idempotent).
- ERD or table reference in `docs/` (generated or hand-written).

**Acceptance criteria.**
- `alembic upgrade head` builds the schema on a fresh Supabase/Postgres.
- Seed runs twice with no duplicates/errors.
- RLS: a user in car wash A cannot `SELECT` car wash B's orders via the Supabase
  client; an org owner sees both. (Proven by a test or documented psql session.)
- No monetary float anywhere; all timestamps `timestamptz`.

**Commit sequence.**
```
db(tenancy): add organizations, car_washes, profiles, memberships
db(pricing): add car_types, services, packages, prices
db(orders): add boxes, shifts, clients, cars, orders, order_services
db(tenancy): add rls policies and auth_user_car_wash_ids helper
chore(db): add idempotent seed script
docs(db): add schema reference and erd
```

**AI prompt.**
> Execute Phase 1. Implement the MVP schema from ARCHITECTURE §5 with SQLAlchemy
> 2.0 + Alembic. Enforce the money rule (minor units + currency), UTC
> timestamps, org-level currency/locale, car_wash-level timezone, and the
> three-level tenancy (organizations → car_washes → memberships). Add RLS to
> orders and boxes gated by membership via a SECURITY DEFINER helper. Provide an
> idempotent seed. Prove tenant isolation. Follow the commit sequence.

---

## Phase 2 — Auth & tenancy

**Objective.** Real login and a `TenantContext` enforced on every request.

**Scope (in).** Supabase Auth (email+password) enabled; web login/logout +
protected routes + session; FastAPI dependency that verifies the Supabase JWT
and builds `TenantContext` from `memberships`; org/car-wash switcher;
role→capability matrix; `profiles` row created on signup.

**Scope (out).** Domain endpoints (Phase 3) beyond a `GET /me` that returns the
resolved tenant context.

**Deliverables.**
- `apps/api/.../deps/auth.py` (JWT verify), `deps/tenancy.py` (TenantContext).
- `GET /me` returning user + org + accessible car washes + role.
- Web: login page, auth guard, Supabase session wiring, car-wash switcher UI.
- Capability matrix module + tests.

**Acceptance criteria.**
- Unauthenticated API calls → 401. Valid JWT → resolved context.
- A washer cannot access another car wash's data via the API (403/empty),
  proven by tests.
- Owner's `/me` lists all car washes; a manager's lists one.
- Web: unauthenticated users are redirected to login; logout clears session.

**Commit sequence.**
```
feat(auth): verify supabase jwt in fastapi dependency
feat(tenancy): build tenant context from memberships
feat(api): add /me endpoint returning tenant context
feat(web): add login, logout, and auth-guarded routing
feat(web): add organization/car-wash switcher
test(tenancy): cover isolation and role capabilities
```

**AI prompt.**
> Execute Phase 2. Wire Supabase Auth email+password. In FastAPI, add a
> dependency chain that verifies the Supabase JWT and builds the TenantContext
> (ARCHITECTURE §3–4) from memberships, exposing GET /me. Add a role→capability
> matrix. On the web, implement login/logout, route guards, session via the
> Supabase client, and a car-wash switcher. Prove isolation with tests.

---

## Phase 3 — Backend core API

**Objective.** All MVP business endpoints, typed via OpenAPI, tenant-scoped,
tested. This is where the old `orders.js` logic is reborn — cleanly.

**Scope (in).**
- **Catalog/pricing:** CRUD for car types, services, packages; price matrix.
- **Clients/cars:** lookup by plate/name; upsert on order creation.
- **Boxes:** list with live status; CRUD (manager+).
- **Shifts:** open/close; "current shift" gating for order creation.
- **Orders:** create (upsert client+car, compute price from services/package,
  apply discount, assign box or **enqueue** if busy), close (promote next
  queued order — the queue state machine), cancel, list (paginated, filtered),
  detail.
- All amounts minor-unit + currency; all times UTC; all reads/writes scoped by
  `TenantContext`.

**Scope (out).** Stats aggregation (Phase 5), realtime (web subscribes in
Phase 4), notifications.

**Deliverables.** FastAPI routers + services + repositories per module;
Pydantic schemas (codes, not prose); pytest suite incl. queue and pricing rules;
regenerated OpenAPI.

**Acceptance criteria.**
- Order create: new client/car are upserted; price is computed server-side;
  box becomes `busy` or order is `queued` if box occupied.
- Order close: active order → `done`, next `queued` order is promoted, box state
  updated atomically (single transaction).
- Only roles with the capability can close orders / edit pricing.
- Every list endpoint is tenant-scoped; cross-tenant access is impossible.
- OpenAPI is complete and the generated client compiles.

**Commit sequence.**
```
feat(pricing): add car types, services, packages, and price matrix endpoints
feat(orders): add client/car lookup and upsert
feat(boxes): add box listing and management endpoints
feat(shifts): add open/close and current-shift gating
feat(orders): add create order with price calc and queue assignment
feat(orders): add close/cancel with queue promotion state machine
feat(orders): add paginated, filtered order listing and detail
test(orders): cover queue promotion, pricing, and shift gating
```

**AI prompt.**
> Execute Phase 3. Implement the MVP business API in FastAPI per ARCHITECTURE
> §5–6: pricing/catalog, clients/cars upsert, boxes, shifts (with current-shift
> gating), and orders with the create→queue and close→promote state machine —
> all in transactions, all tenant-scoped, money in minor units, time in UTC.
> Return codes not prose. Cover queue/pricing/gating with pytest. Regenerate the
> OpenAPI client into packages/shared. Follow the commit sequence.

---

## Phase 4 — Frontend core

**Objective.** The operator-facing app: a live boxes board and the full order
lifecycle, fully internationalized.

**Scope (in).**
- **i18n foundation:** next-intl, `en`/`ru`/`kk` catalogs, locale switch, code→
  text mapping for statuses/errors, `Intl` money/date formatting (org currency,
  car-wash timezone).
- **Live boxes board:** Supabase Realtime subscription on `orders`/`boxes`,
  optimistic updates, queue display.
- **Order intake flow:** plate/client lookup, car type + services/package,
  discount, price preview, submit → FastAPI.
- **Order list/detail:** pagination, filters, statuses.
- **Shift control:** open/close shift UI.
- **Admin:** pricing/services/packages editor; boxes; washers & roles.
- Typed API access via the generated client + TanStack Query; forms via RHF+Zod.

**Scope (out).** Charts/stats (Phase 5).

**Deliverables.** Pages/components for board, intake, orders, shifts, admin;
i18n setup + catalogs; data hooks; loading/empty/error states.

**Acceptance criteria.**
- Creating an order from the UI shows it on the board in real time; closing it
  promotes the queue live.
- Switching locale changes all UI text; money/dates render per org currency and
  car-wash timezone.
- No hard-coded user-facing strings; all go through catalogs.
- A washer's UI is limited to their car wash and permitted actions.

**Commit sequence.**
```
feat(i18n): add next-intl with en/ru/kk catalogs and formatters
feat(web): add live boxes board via supabase realtime
feat(orders): add order intake flow with price preview
feat(orders): add order list and detail views
feat(shifts): add shift open/close UI
feat(pricing): add services, packages, and price admin
feat(web): add boxes and washers/roles administration
```

**AI prompt.**
> Execute Phase 4. Build the operator web app on Next 16. Start with the i18n
> foundation (next-intl, en/ru/kk, code→text mapping, Intl money/date using org
> currency + car-wash timezone). Build the realtime boxes board (Supabase
> Realtime), order intake, order list/detail, shift control, and admin screens.
> Consume the generated OpenAPI client via TanStack Query; forms with RHF+Zod.
> No hard-coded strings. Follow the commit sequence.

---

## Phase 5 — Stats & dashboard

**Objective.** Analytics at two levels: a single car wash, and the owner's
cross-wash rollup over the whole organization.

**Scope (in).** Aggregation endpoints (revenue, order counts, by service, by
shift, by car wash) — tenant-scoped; an org-level rollup available only to
`owner`/`org_admin`; a dashboard with charts (Recharts/Tremor), date-range
filter, currency- and timezone-correct rendering.

**Acceptance criteria.**
- A manager sees only their car wash; an owner can see per-wash and a combined
  view across all washes in the org.
- Date ranges respect the car wash timezone; revenue respects org currency.
- Aggregations match raw data in tests.

**Commit sequence.**
```
feat(stats): add per-car-wash aggregation endpoints
feat(stats): add organization-level cross-wash rollup for owners
feat(web): add dashboard with charts and date-range filter
test(stats): verify aggregations and tenant scoping
```

**AI prompt.**
> Execute Phase 5. Add tenant-scoped aggregation endpoints and an owner-only
> org-wide rollup. Build a dashboard with charts, a date-range filter,
> currency/timezone-correct rendering. Verify aggregations and scoping in tests.

---

## Phase 6 — Hardening

**Objective.** Make the MVP production-trustworthy.

**Scope (in).** Full RLS audit (extend policies to all tenant tables as
defense-in-depth); consistent API error model (codes + HTTP); input validation
edges; Playwright e2e for login/create-order/close-order; accessibility pass
(keyboard, labels, contrast); structured logging + request IDs; basic rate
limiting on auth; a security review (authz on every endpoint, no IDOR, secrets
hygiene).

**Acceptance criteria.**
- Every operational table has RLS; an automated test asserts cross-tenant denial.
- e2e suite green. a11y has no critical violations on core screens.
- Security checklist in `docs/` completed and signed off.

**Commit sequence.**
```
fix(tenancy): extend rls to all tenant tables
refactor(api): unify error model with stable codes
test(web): add playwright e2e for core flows
fix(web): resolve accessibility issues on core screens
feat(api): add structured logging and request ids
docs(repo): add security review checklist
```

**AI prompt.**
> Execute Phase 6. Audit and extend RLS to all tenant tables; unify the API
> error model; add Playwright e2e for core flows; fix a11y issues; add
> structured logging + request IDs and auth rate limiting; complete a security
> review checklist. Prove cross-tenant denial with an automated test.

---

## Phase 7 — Deploy MVP

**Objective.** Ship.

**Scope (in).** Vercel projects for web and api; connect Supabase
(`carswash-db`) prod; env management for all environments; production Alembic
migration run; smoke tests against prod; finalize README + runbook; tag `v0.1.0`.

**Acceptance criteria.**
- Web and API deploy on Vercel; web talks to API; API talks to Supabase prod.
- Migrations applied to prod; seed (or first org) created.
- Smoke test: sign in → open shift → create order → see it on the board → close
  it → see it in stats — all in production.
- Rollback procedure documented.

**Commit sequence.**
```
ci(repo): add production deploy workflows for web and api
docs(repo): add deployment runbook and rollback procedure
chore(repo): tag v0.1.0 mvp
```

**AI prompt.**
> Execute Phase 7. Deploy web and api to Vercel, connect Supabase prod, manage
> env across environments, run migrations on prod, and validate the full
> sign-in→shift→order→board→close→stats flow in production. Document the runbook
> and rollback. Tag v0.1.0.

---

## Post-MVP phases (outline)

Planned, with clean seams already in the architecture. Detailed when reached.

- **Phase 8 — CRM integrations.** Public partner API + OpenAPI; inbound/outbound
  webhooks; Bitrix24 connector (orders/clients sync, events). Scope `crm`.
- **Phase 9 — Online booking.** Public booking endpoints + slots; converts to
  `queued` orders. Scope `booking`.
- **Phase 10 — Push notifications.** Web Push / FCM via env; notify washers and
  managers on order events. Scope `notify`.
- **Phase 11 — Mobile washer app.** `apps/mobile` (Expo), reusing the generated
  API client; native push and camera. Scope `mobile`.
- **Phase 12 — AI / ANPR.** `apps/ml` (FastAPI + CV) for license-plate
  recognition and demand analytics, called by the core API. Scope `ml`.
