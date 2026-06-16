# Database reference (Phase 1)

The canonical schema for CarsWash: SQLAlchemy 2.0 models in
`apps/api/app/models/`, migrated by Alembic in `apps/api/migrations/`. This is
the data model from ARCHITECTURE.md §5, with the concrete decisions taken in
Phase 1.

## Conventions

- **Primary keys** — `uuid`, `server_default gen_random_uuid()`.
- **Money** — every monetary column is `BIGINT` minor units named
  `*_amount_minor`. Catalog/price tables store the amount only; the currency is
  the organization's `currency`, resolved on read. Orders **snapshot**
  `currency CHAR(3)` at sale time so historical totals never shift.
- **Time** — every timestamp is `timestamptz` stored in UTC. `car_washes.timezone`
  is an IANA name (e.g. `Asia/Almaty`); "today/this shift" boundaries are
  computed at the edge in that timezone.
- **Enums** — native Postgres enum types, codes only (no localized prose):
  `membership_role (owner, org_admin, manager, washer)`,
  `order_status (queued, in_progress, done, cancelled)`,
  `box_status (free, busy)`.
- **Indexes** — every foreign key is indexed; plus a composite
  `orders(car_wash_id, status)` for the live board/queue.

## Tables

### Tenancy & identity

| table | key columns | notes |
|-------|-------------|-------|
| `organizations` | `name`, `currency CHAR(3)`, `default_locale`, `plan`, `created_at` | the network / owner account |
| `car_washes` | `organization_id→`, `name`, `timezone` (IANA), `address?`, `is_active`, `created_at` | a physical location |
| `profiles` | `id = auth.users.id`, `full_name?`, `locale?`, `avatar_url?` | mirror of Supabase `auth.users` |
| `memberships` | `user_id→auth.users`, `organization_id→`, `car_wash_id→?` (nullable), `role` | links a user to an org / location |

`memberships.car_wash_id IS NULL` + role `owner`/`org_admin` ⇒ access to **every**
car wash in the organization; a set `car_wash_id` scopes to that single location.

### Catalog & pricing (prices are per car wash)

| table | key columns | notes |
|-------|-------------|-------|
| `car_types` | `organization_id→`, `name`, `sort` | body classes |
| `services` | `organization_id→`, `name`, `is_active` | service definitions |
| `service_prices` | `car_wash_id→`, `service_id→`, `car_type_id→`, `amount_minor` | UNIQUE(car_wash, service, car_type) |
| `packages` | `organization_id→`, `name`, `is_active` | bundles |
| `package_services` | `package_id→`, `service_id→` | UNIQUE(package, service) |
| `package_prices` | `car_wash_id→`, `package_id→`, `car_type_id→`, `amount_minor` | UNIQUE(car_wash, package, car_type) |

### Operations

| table | key columns | notes |
|-------|-------------|-------|
| `boxes` | `car_wash_id→`, `name`, `status box_status`, `active_order_id?` (uuid, no FK), `sort` | a wash bay |
| `shifts` | `car_wash_id→`, `opened_by→auth.users`, `opened_at`, `closed_at?` | work period |
| `clients` | `organization_id→`, `name`, `phone?` | customer |
| `cars` | `plate`, `car_type_id→`, `brand?`, `model?` | brand/model free text (MVP) |
| `client_cars` | `client_id→`, `car_id→` | link |
| `orders` | `car_wash_id→`, `box_id→`, `shift_id→`, `client_car_id→`, `status order_status`, `price_amount_minor`, `currency CHAR(3)`, `discount_pct`, `package_id→?`, `created_by→auth.users`, `started_at?`, `finished_at?`, `created_at` | the wash order |
| `order_services` | `order_id→`, `service_id→`, `unit_amount_minor`, `qty` | line items (price snapshot) |

`boxes.active_order_id` is a plain nullable `uuid` (no FK) to avoid a circular
constraint with `orders.box_id`, which carries the enforced reference.

## Tenant isolation (RLS)

Only the realtime-exposed tables carry RLS in Phase 1 — `orders` and `boxes` —
because the web subscribes to them directly via Supabase Realtime. The REST API
path is guarded in the application layer (Phase 2+); full RLS coverage of every
tenant table is Phase 6.

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

### Proof of isolation

`apps/api/tests/test_rls.py` creates (in a rolled-back transaction) one
organization with two car washes, an org owner and a location washer, and one
order per car wash. It then queries `orders` under each user's context
(`SET ROLE authenticated` + `request.jwt.claims.sub`):

- the **washer** (scoped to car wash A) sees only car wash A's order;
- the **owner** (org-wide) sees both.

The test runs against the configured Postgres and is skipped when no database is
configured (e.g. CI without secrets).

## Running

```bash
# Migrations (uses POSTGRES_URL_NON_POOLING — the direct connection)
uv run --directory apps/api alembic upgrade head
uv run --directory apps/api alembic downgrade base   # full teardown

# Idempotent dev seed (1 org, 2 car washes, catalog, prices, boxes)
uv run --directory apps/api python -m scripts.seed

# Prove RLS isolation
uv run --directory apps/api pytest tests/test_rls.py
```

The runtime app connects through `POSTGRES_URL` (the Supavisor transaction
pooler) with prepared statements disabled; Alembic always uses the direct
connection for DDL.
