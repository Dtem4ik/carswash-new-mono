# Database reference

The canonical schema for CarsWash: SQLAlchemy 2.0 models in
`apps/api/app/models/`, migrated by Alembic in `apps/api/migrations/`. It
implements ARCHITECTURE.md §5, with the decisions taken in Phase 1, the
corrective refinements from Phase 1.5 (migrations `0005`–`0010`), and the money /
cash / payroll / integrity foundations from Phase 1.6 (migrations `0011`–`0017`,
recorded in `docs/ai/phase-1.6-decisions.md`).

## Conventions

- **Primary keys** — `uuid`, `server_default gen_random_uuid()`.
- **Money** — every monetary column is `BIGINT` minor units named
  `*_amount_minor`, constrained `>= 0`. Catalog/price tables store the amount
  only; the currency is the **car wash's** `currency`, resolved on read. Orders
  **snapshot** `currency CHAR(3)` at sale time so historical totals never shift.
- **Currency** — lives on `car_washes.currency`; `organizations.default_currency`
  is the fallback a new car wash inherits.
- **Time** — every timestamp is `timestamptz` in UTC. `car_washes.timezone` is an
  IANA name (e.g. `Asia/Almaty`). Mutable tables carry `updated_at`, kept current
  by a `set_updated_at()` trigger (uses `clock_timestamp()`).
- **Enums** — native Postgres enum types, codes only (no localized prose):
  `membership_role (owner, org_admin, manager, washer)`,
  `order_status (queued, in_progress, done, cancelled)`,
  `box_status (free, busy)`,
  `payment_method (cash, card, transfer, bonus)`,
  `payment_kind (payment, refund)`,
  `order_payment_status (unpaid, partial, paid, credit, refunded)`,
  `cash_movement_type (expense, payout, collection, deposit)`,
  `discount_type (none, manual, loyalty, promo, subscription)`,
  `client_kind (walkin, regular, corporate)`.
- **Indexes** — every foreign key is indexed; plus a composite
  `orders(car_wash_id, status)` for the live board/queue.

## Tables

### Tenancy & identity

| table | key columns | notes |
|-------|-------------|-------|
| `organizations` | `name`, `default_currency CHAR(3)`, `default_locale`, `plan`, `created_at`, `updated_at` | the network / owner account |
| `car_washes` | `organization_id→`, `name`, `timezone` (IANA), `currency CHAR(3)`, `address?`, `is_active`, `created_at`, `updated_at` | a physical location |
| `profiles` | `id = auth.users.id`, `full_name?`, `locale?`, `avatar_url?` | mirror of Supabase `auth.users` |
| `memberships` | `user_id→auth.users`, `organization_id→`, `car_wash_id→?` (nullable), `role` | links a user to an org / location |

`memberships.car_wash_id IS NULL` + role `owner`/`org_admin` ⇒ access to **every**
car wash in the organization; a set `car_wash_id` scopes to that single location.

### Catalog & pricing (prices are per car wash)

| table | key columns | notes |
|-------|-------------|-------|
| `car_types` | `organization_id→`, `name`, `sort`, `is_active` | body classes |
| `services` | `organization_id→`, `name`, `is_active` | service definitions |
| `service_prices` | `car_wash_id→`, `service_id→`, `car_type_id→`, `amount_minor`, `updated_at` | UNIQUE(car_wash, service, car_type); `amount_minor >= 0` |
| `packages` | `organization_id→`, `name`, `is_active` | bundles |
| `package_services` | `package_id→`, `service_id→` | UNIQUE(package, service) |
| `package_prices` | `car_wash_id→`, `package_id→`, `car_type_id→`, `amount_minor`, `updated_at` | UNIQUE(car_wash, package, car_type); `amount_minor >= 0` |

### Operations

| table | key columns | notes |
|-------|-------------|-------|
| `boxes` | `car_wash_id→`, `name`, `status box_status`, `active_order_id?` (uuid, no FK), `sort`, `is_active`, `updated_at` | a wash bay; UNIQUE(car_wash_id, id) |
| `shifts` | `car_wash_id→`, `opened_by→auth.users`, `closed_by?→auth.users`, `opened_at`, `closed_at?`, `opening_float_minor`, `counted_cash_minor?`, `closing_expected_minor?` | work period + till reconciliation; UNIQUE(car_wash_id, id); one open shift per wash |
| `clients` | `organization_id→`, `name`, `phone?`, `kind client_kind`, `updated_at` | dedup: partial UNIQUE(org, phone) WHERE phone IS NOT NULL |
| `cars` | `organization_id→`, `plate`, `car_type_id→`, `brand?`, `model?`, `updated_at` | dedup: UNIQUE(org, normalized plate) |
| `client_cars` | `client_id→`, `car_id→` | link |
| `orders` | `car_wash_id→`, `box_id→`, `shift_id→`, `client_car_id?→`, `plate?`, `car_type_id→`, `number`, `status order_status`, `subtotal_minor`, `discount_amount_minor`, `discount_type`, `total_minor`, `currency CHAR(3)`, `payment_status`, `authorized_by?→auth.users`, `package_id→?`, `created_by→auth.users`, `finished_by?→auth.users`, `started_at?`, `finished_at?`, `created_at`, `updated_at` | the wash order; UNIQUE(car_wash_id, number) |
| `order_services` | `order_id→`, `service_id→`, `unit_amount_minor`, `qty` | line items (price snapshot); `unit_amount_minor >= 0` |
| `order_washers` | `order_id→` (CASCADE), `user_id→auth.users` (RESTRICT), `share_bps`, `earned_amount_minor` | washers on an order; UNIQUE(order, user); pay snapshot |
| `payments` | `order_id→` (CASCADE), `car_wash_id→` (RESTRICT), `method payment_method`, `kind payment_kind`, `amount_minor`, `currency CHAR(3)`, `received_by?→auth.users`, `paid_at`, `created_at`, `updated_at` | money against an order; `amount_minor >= 0` |
| `cash_movements` | `shift_id→` (CASCADE), `car_wash_id→` (RESTRICT), `type cash_movement_type`, `amount_minor`, `reason?`, `payee_user_id?→auth.users`, `created_by→auth.users`, `created_at` | non-sale cash events; `amount_minor >= 0` |
| `car_wash_order_counters` | `car_wash_id` PK→ (CASCADE), `next_number` | per-wash allocator for `orders.number` |

`boxes.active_order_id` is a plain nullable `uuid` (no FK) to avoid a circular
constraint with `orders.box_id`, which carries the enforced reference.
`orders.created_by` is who opened the order; `orders.finished_by` is who closed
it; `orders.car_type_id` snapshots the body class used for pricing at sale time.

### Money, cash & payroll

- **Order money** is an explicit breakdown: `subtotal_minor` (pre-discount),
  `discount_amount_minor` (exact money), and `total_minor` (net), with
  `discount_type` and `authorized_by` for provenance. The invariant
  `total_minor = subtotal_minor - discount_amount_minor` is a CHECK, so the three
  figures can never drift.
- **Payments** are a first-class entity: an order can have several (mixed tender,
  prepay + top-up). They are the **source of truth** for `orders.payment_status`
  (a denormalized cache the app maintains). A **refund** is a row with
  `kind='refund'` and a **positive** amount — never a negative payment.
- **Shift till** — a shift opens with `opening_float_minor` and, at close,
  snapshots `closing_expected_minor` and records the counted `counted_cash_minor`;
  the variance is derivable. `cash_movements` records non-sale cash events
  (expense / payout / collection / deposit) during the shift.
- **Washer payroll** — `order_washers.share_bps` (basis points of the washer
  pool) and `earned_amount_minor` are **snapshotted at sale time** so historical
  pay never moves when rates change. The rate-config source (per-service /
  per-car-wash policy) is deferred to a later phase; these columns are the seam.
- **Order number** — `orders.number` is a per-car-wash, monotonic receipt number
  (no daily reset), allocated from `car_wash_order_counters` (Phase 3 locks the
  row and returns-then-increments inside the order tx). UNIQUE(car_wash_id, number).
- **Walk-ins** — `orders.client_car_id` is nullable; an anonymous "washed and
  left" car is recorded by `orders.plate` alone (`car_type_id` still drives
  pricing). `clients.kind` distinguishes walk-in / regular / corporate.

### Integrity checks

- `orders`: `subtotal_minor >= 0`, `discount_amount_minor >= 0`,
  `discount_amount_minor <= subtotal_minor`, and
  `total_minor = subtotal_minor - discount_amount_minor`.
- `*_amount_minor >= 0` on `order_services`, `service_prices`, `package_prices`,
  `payments`, `cash_movements`.
- `shifts`: `opening_float_minor >= 0`, `counted_cash_minor >= 0`.
- `order_washers`: `share_bps >= 0`, `earned_amount_minor >= 0`.

### Tenant integrity by construction

- **One open shift per car wash** — partial unique index
  `uq_shifts_one_open ON shifts(car_wash_id) WHERE closed_at IS NULL`.
- **No cross-wash references** — `boxes` and `shifts` carry a composite
  UNIQUE(car_wash_id, id); `orders` carries composite FKs
  `(car_wash_id, box_id) → boxes(car_wash_id, id)` and
  `(car_wash_id, shift_id) → shifts(car_wash_id, id)`, so an order can never point
  at another car wash's box or shift. The single-column FKs/indexes are kept.

### Dedup & plate normalization

- **Cars** are unique per organization by a **normalized plate**:
  `upper(regexp_replace(plate, '\s', '', 'g'))` — uppercased with all whitespace
  removed (a functional unique index). So `"ABC 123"` and `"abc123"` collide
  within one org, but the same plate is allowed in a different org.
- **Clients** are unique per organization by `phone` (partial index; rows with a
  `NULL` phone are exempt).

### `updated_at` triggers

A shared `public.set_updated_at()` trigger function sets `NEW.updated_at` on every
`UPDATE` (BEFORE UPDATE trigger on each mutable table: `organizations`,
`car_washes`, `service_prices`, `package_prices`, `boxes`, `clients`, `cars`,
`orders`, `payments`). It uses `clock_timestamp()` so the value reflects the
actual write moment.

## Tenant isolation (RLS)

Only the realtime-exposed tables carry RLS — `orders` and `boxes` — because the
web subscribes to them directly via Supabase Realtime. The REST API path is
guarded in the application layer (Phase 2+); full RLS coverage of every tenant
table is Phase 6.

A `SECURITY DEFINER` helper resolves the car washes the current Supabase user
may see:

```sql
public.auth_user_car_wash_ids() RETURNS SETOF uuid
-- org-level memberships (car_wash_id IS NULL) -> every car wash in the org
-- location-level memberships               -> that single car wash
-- keyed off auth.uid() (the JWT 'sub')
```

Each table grants `SELECT` to the `authenticated` role and enforces:

```sql
CREATE POLICY <table>_select_by_membership ON public.<table>
    FOR SELECT TO authenticated
    USING (car_wash_id IN (SELECT public.auth_user_car_wash_ids()));
```

### Proof of isolation & integrity

- `apps/api/tests/test_rls.py` — a washer scoped to car wash A sees only car
  wash A's orders; an org owner sees both (queried under each user's
  `SET ROLE authenticated` + `request.jwt.claims.sub` context).
- `apps/api/tests/test_schema.py` — car plate dedup (duplicate within an org
  rejected, same plate across orgs allowed), `order_washers` link + uniqueness,
  and `updated_at` advancing on UPDATE.
- `apps/api/tests/test_money_foundations.py` — one open shift per car wash, the
  cross-wash composite FK rejecting another wash's box, the order money CHECK
  (`total = subtotal - discount`), the payment + refund flow with `payment_status`,
  and an anonymous walk-in order (NULL `client_car_id` + `plate`).

All run against the configured Postgres in rolled-back transactions and are
skipped when no database is configured (e.g. CI without secrets).

## Running

```bash
# Migrations (uses POSTGRES_URL_NON_POOLING — the direct connection)
uv run --directory apps/api alembic upgrade head
uv run --directory apps/api alembic downgrade base   # full teardown
uv run --directory apps/api alembic check            # models vs DB drift

# Idempotent dev seed (1 org, 2 car washes w/ currency, catalog, prices, boxes)
uv run --directory apps/api python -m scripts.seed

# Tests (RLS + schema refinements)
uv run --directory apps/api pytest
```

The runtime app connects through `POSTGRES_URL` (the Supavisor transaction
pooler) with prepared statements disabled; Alembic always uses the direct
connection for DDL.
