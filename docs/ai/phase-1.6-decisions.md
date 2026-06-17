# Phase 1.6 — Decisions (ADR): money, cash, payroll & integrity foundations

Status: **accepted & implemented** (migrations `0011`–`0017`). This records the
tech-lead verdicts on the proposals in `phase-1.6-review.md` and what landed.
Data-model only — no API/auth/frontend. Invariants carried throughout: money is
`BIGINT *_amount_minor` (never float, `>= 0` via CHECK; refunds use a `kind`
discriminator, not negatives), currency `CHAR(3)` snapshotted from the car wash,
time `timestamptz` UTC, PK `uuid`, every FK indexed, native enums (codes only),
each migration reversible, `alembic check` clean.

## P1 — Payments as a first-class entity — **Accept** (`0011`)
- **Car-wash rationale:** a single order can take mixed tender (part cash / part
  card), prepay + top-up, and refunds; every financial report keys off method and
  who took the money. A column on `orders` cannot represent N payments.
- **Reversibility:** payment history is the textbook "cannot be reconstructed
  retroactively" case — the table must exist before any order is sold.
- **Shape:** `payments(order_id→orders CASCADE, car_wash_id→car_washes RESTRICT,
  method payment_method, kind payment_kind='payment', amount_minor>=0,
  currency CHAR(3), received_by?→auth.users RESTRICT, paid_at, created_at,
  updated_at)`. Refund = `kind='refund'` with a positive amount.

## P2 — Payment status on the order (incl. credit/postpaid) — **Modify** (`0011`)
- **Verdict:** keep an enum on the order, but payments are the **source of truth**;
  `orders.payment_status` is a denormalized cache the app maintains.
- **Rationale:** corporate/taxi clients wash on credit from day one; the live
  board and reports must show unpaid/owed without summing payments per row.
  `credit` and `refunded` are states the payment sum alone cannot express.
- **Shape:** `order_payment_status (unpaid, partial, paid, credit, refunded)`,
  `NOT NULL default 'unpaid'`.

## P3 — Shift till reconciliation + cash movements — **Accept** (`0012`)
- **Car-wash rationale:** the reason shifts exist is end-of-shift reconciliation
  and owner trust; expenses, washer payouts and collections (инкассация) happen
  during the shift and must be captured to explain the drawer.
- **Shape:** `shifts += opening_float_minor (>=0), counted_cash_minor? (>=0),
  closing_expected_minor?, closed_by?→auth.users`. New
  `cash_movements(shift_id→shifts CASCADE, car_wash_id→car_washes RESTRICT,
  type cash_movement_type, amount_minor>=0, reason?, payee_user_id?→auth.users,
  created_by→auth.users, created_at)`.

## P4 — Washer payroll snapshot, variable washers — **Accept the seam** (`0014`)
- **Car-wash rationale:** washers are paid piece-rate, a car may be split between
  1..N washers, and rates change over time; historical payroll must not move.
- **Shape:** `order_washers += share_bps (basis points of the washer pool, >=0),
  earned_amount_minor (>=0, snapshotted at sale time)`.
- **Deferred:** where the rate lives (per-service vs per-car-wash policy) and the
  computation are **out of scope for 1.6** — only the snapshot columns are laid
  now, because they are the thing that cannot be reconstructed later. The
  rate-config table/seam will be a clean additive migration in a later phase.

## P5 — Order money breakdown + discount provenance — **Accept** (`0013`)
- **Verdict:** replace `price_amount_minor` + `discount_pct` with an explicit
  breakdown; do **not** keep `discount_pct` (a percentage loses the exact figure
  to rounding and would be a second source of truth).
- **Shape:** rename `price_amount_minor → total_minor`; drop `discount_pct`; add
  `subtotal_minor (>=0), discount_amount_minor (>=0), discount_type
  (none|manual|loyalty|promo|subscription), authorized_by?→auth.users`. CHECKs:
  `discount_amount_minor <= subtotal_minor` and
  `total_minor = subtotal_minor - discount_amount_minor`. `total_minor` is **net**.

## P6 — Human-readable order number — **Modify** (`0015`)
- **Verdict:** per **car wash**, **monotonic** (no daily reset), allocated from a
  counter row — not a global sequence and not per-shift.
- **Rationale:** receipts/lookup are per location; daily reset creates collisions
  across days and complicates reporting; a per-wash counter row locked in the
  order tx gives gap-free monotonic numbers without a hot global sequence.
- **Shape:** `orders.number BIGINT NOT NULL`, `UNIQUE(car_wash_id, number)`; new
  `car_wash_order_counters(car_wash_id PK→car_washes CASCADE, next_number=1)`.
  Allocation logic is Phase 3 — only the structure now.

## P7 — Time-based booking — **Defer to Phase 9**
- **Verdict:** not laid in 1.6. Online booking is a Phase 9 feature and a future
  `bookings` table (`car_wash_id`, `client_id?`/`car_id?`, `scheduled_at`,
  `status`, converts to a `queued` order on arrival) is a **clean additive**
  migration — nothing about it must exist in the bones now, and folding
  `scheduled_at`/a `booked` status onto `orders` would pollute order analytics
  with not-yet-real orders. Revisit when Phase 9 starts.

## P8 — Capture actors vs adding a cashier role — **Modify** (per-action capture)
- **Verdict:** record **who did each money action** rather than introducing a
  `cashier` membership role now. Actors captured: `orders.created_by` (opened),
  `orders.finished_by` (closed), `orders.authorized_by` (discount),
  `payments.received_by`, `shifts.closed_by`, `cash_movements.created_by` /
  `payee_user_id`.
- **Rationale:** on small sites the admin *is* the cashier; a role adds gating
  with no data it cannot already attribute. Adding a `cashier` enum value later is
  a cheap, non-breaking change.

## Secondary

### Single open shift per car wash — **Accept** (`0017`)
Partial unique index `uq_shifts_one_open ON shifts(car_wash_id) WHERE
closed_at IS NULL`. Phase 3 gates order creation on the current shift, so the
"exactly one open" invariant belongs in the database, not only app code.

### Cross-tenant integrity — **Accept** (`0017`)
Composite UNIQUE(car_wash_id, id) on `boxes` and `shifts`, plus composite FKs on
`orders` — `(car_wash_id, box_id) → boxes(car_wash_id, id)` and
`(car_wash_id, shift_id) → shifts(car_wash_id, id)`. An order can no longer
reference another car wash's box/shift even if app code is wrong. Single-column
FKs/indexes are kept (cheap, and they back the hot lookups). Worth it: the cost
is two unique keys + two FKs; the benefit is isolation by construction.

### Walk-in friction — **Accept** (`0016`)
`orders.client_car_id` becomes nullable and `orders.plate` is added so an
anonymous "washed and left" car needs no client+car rows (`car_type_id` still
drives pricing). `clients.kind (walkin|regular|corporate)` distinguishes the
client types the reports and postpaid/loyalty logic will need.

## Summary — laid now vs deferred
- **Now (cannot be reconstructed retroactively):** payments, order money
  breakdown, washer pay snapshot, till fields + cash movements, order number,
  walk-in plate, per-action actors, cross-wash FKs, single-open-shift.
- **Deferred (clean additive later):** booking table (Phase 9), washer
  rate-config source (later phase), `cashier` role value (later, if needed).
