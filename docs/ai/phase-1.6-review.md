# Phase 1.5 → 1.6 — Data-model review: money, cash, payroll, bookings

> This is a **design-review prompt**, not an implementation order. The reviewer
> acts as a tech lead. Each proposal below must be **accepted, rejected, or
> modified with reasoning** — grounded in how a real car wash operates and in
> long-term scalability. Do **not** write migrations or models until the owner
> approves the decisions. Stay on the data model only (no API/auth/frontend).

---

## 1. Your role and mindset

You are a **senior backend/data architect acting as the tech lead** for CarsWash,
a multi-tenant SaaS for car-wash networks (`carswash-new-mono`, current dir).
Phase 1 (schema) and Phase 1.5 (corrective refinements) are merged to main. A
domain review has produced the proposals in §6. Your job is to **critique them
like a tech lead reviewing a PR design doc**:

- Think **car-wash-first**. Before judging any column, reconstruct how the
  business actually runs (roles, the shift cycle, the money flow, payroll,
  reporting). Reason from the operation, not from generic SaaS habits.
- **Accept, reject, or modify** each proposal. A good tech lead rejects
  *over-engineering* as readily as they catch *missing foundations*. Premature
  complexity that no MVP report needs is a "reject / defer", and say why.
- Optimize for **reversibility and scalability**. The data model is the most
  expensive thing to change later: ask "can this be added cleanly by a future
  migration, or must it be in the bones now because it can't be reconstructed
  retroactively?" That single test decides most of what belongs at the start.
- Distinguish **"lay the seam now"** (a thin, future-proof structure) from
  **"build the feature now"** (full behavior). Many of these need only a seam.

The guiding principle from the owner: **logic and the data model are the
critical stage** — get them right so the product scales without painful rewrites.

## 2. Read first (binding)

`docs/ARCHITECTURE.md` (§1, §3, §5, §6, §8), `docs/DB.md`, `docs/CONVENTIONS.md`,
`docs/ROADMAP.md` (note what is already promised to post-MVP phases 8–12 — do not
re-propose those as if new). Inspect the current models in
`apps/api/app/models/` and migrations `0001–0005+`.

## 3. Current schema (after Phase 1.5) — the baseline you are reviewing

- **Tenancy:** `organizations` (default_currency, default_locale, plan) →
  `car_washes` (timezone, currency, is_active) → `memberships`
  (user_id, organization_id, car_wash_id?, role). `profiles` mirrors
  `auth.users`. Roles enum: `owner, org_admin, manager, washer`.
- **Catalog/pricing (per car wash):** `car_types`, `services`, `service_prices`
  (car_wash × service × car_type → amount_minor), `packages`,
  `package_services`, `package_prices`. `is_active` on services/packages/
  car_types.
- **Operations:** `boxes` (status, active_order_id, is_active), `shifts`
  (opened_by, opened_at, closed_at), `clients` (organization_id, name, phone?),
  `cars` (organization_id, plate, car_type_id; dedup by normalized plate),
  `client_cars`, `orders`, `order_services` (unit_amount_minor, qty),
  `order_washers` (order_id, user_id; UNIQUE(order_id,user_id)).
- **`orders` today:** car_wash_id, box_id, shift_id, client_car_id, car_type_id
  (snapshot), status (`queued|in_progress|done|cancelled`),
  price_amount_minor, currency (snapshot), discount_pct,
  package_id?, created_by, finished_by?, started_at?, finished_at?, created_at,
  updated_at.

**What the schema can do well today:** compute and snapshot an order's *price*.
**What it cannot do:** record *money* (how it was paid, by whom, cash vs card),
reconcile a shift's till, compute washer payroll, explain discounts, or hold a
future booking. That gap is the subject of this review.

## 4. Non-negotiable invariants (carry into every decision)

- Money = `BIGINT *_amount_minor`, **never** a float; every amount travels with a
  currency (car wash's `currency`, snapshotted on the order at sale time).
- Time = `timestamptz` in UTC; "today/this shift" boundaries computed in the car
  wash's IANA timezone at the edge.
- PK = `uuid` (`gen_random_uuid()`); every FK indexed; enums are native Postgres
  types with **codes only** (no localized prose).
- Each migration has a working `upgrade` **and** `downgrade`; `alembic check`
  shows no drift. English; Conventional Commits (`db` is a scope, not a type).
- Tenant isolation by construction: nothing in the model should make it *easier*
  to mix data across car washes / organizations.

## 5. How a car wash actually works (reconstruct, then extend)

Treat this as the domain brief to pressure-test the proposals. Extend it with
your own reasoning where it is thin.

**Roles.** *Administrator* takes the car, opens the order (services/package +
body type → price), assigns a box and washers, and often takes payment and runs
the till. *Cashier* (only on larger sites) handles money exclusively; on small
sites the admin **is** the cashier. *Washers* physically wash and are paid
**piece-rate — a percentage of the order**, often a different % per service; a
single car may be washed by a **variable number of washers (1..N) at once**, so
the cut is **split** between them. *Clients* are walk-ins ("washed and left") and
regulars (loyalty/subscription physical clients, and **corporate/taxi-fleet
clients on contract who often pay later — postpaid / "on credit"**). The
*owner/manager* never stands at the desk; they live in the reports.

**Shift cycle (where money and numbers are born).**
1. **Open shift** — fix the **opening cash float** (starting cash in the till).
2. **Order** — car arrives, services chosen → price, box + washers assigned; if
   boxes are full the order **queues**.
3. **Payment** — cash / card / transfer (e.g. Kaspi) / **mixed** (part cash,
   part card) / bonus / **credit** (corporate). Sometimes prepaid, sometimes
   after the wash.
4. **Close order** — done; who closed it is recorded.
5. **Cash movements during the shift** — expenses (chemicals, supplies), cash
   **payouts** to washers, **cash collection (инкассация)**.
6. **Close shift = reconcile the till** — system-expected cash vs counted cash,
   the variance, totals by cash/card, and washer payroll for the shift.

**What the owner needs from reports.** Revenue by day/shift/month, per car wash
and rolled up across the network; **cash vs cashless and whether the till
balances**; average ticket and car count; by service/package; **by washer
(throughput and pay)**; by body type; load by hour/day-of-week (peak times);
average wash duration (productivity); corporate debt; expenses and margin.

## 6. Proposals to review (accept / reject / modify — with reasoning)

For **each**: state your verdict, the car-wash reasoning behind it, the
scalability/reversibility argument, the concrete shape you recommend (tables,
columns, types, FKs with on-delete, indexes, constraints, enums), and any
cheaper alternative you considered. Challenge the proposal where warranted.

**P1 — Payment as a first-class entity (not a column on the order).**
A `payments` table: `order_id` FK, `method` enum (`cash|card|transfer|bonus`),
`amount_minor`, `currency`, `paid_at`, `received_by` FK→auth.users. Rationale: one
order may have several payments (mixed; prepay + top-up); every financial report
keys off method and who took the money. *Question to settle:* is a separate table
justified at the start, or is a single payment per order enough for MVP with a
table added later? Argue the retroactivity cost.

**P2 — Payment status on the order, incl. credit/postpaid.**
`payment_status` enum on `orders` (`unpaid|partial|paid|credit|refunded`).
Rationale: corporate/taxi clients wash on credit from day one; the board and
reports must show unpaid/owed. *Question:* enum vs derived-from-payments-sum —
which is the source of truth, and how do you avoid drift?

**P3 — Shift till reconciliation + cash movements.**
On `shifts`: `opening_float_minor`, and at close `counted_cash_minor` (+ keep
expected/ variance derivable). New `cash_movements`: `shift_id` FK, `type` enum
(`expense|payout|collection|deposit`), `amount_minor`, `reason?`, `created_by`,
`created_at`. Rationale: the entire reason shifts exist is end-of-shift
reconciliation and owner trust. *Question:* is `cash_movements` MVP-critical or
can the till open/close fields alone ship first?

**P4 — Washer payroll with a snapshot, for a variable number of washers.**
`order_washers` gains `share` (weight/percentage when 1..N washers split one
car) and a **snapshotted** `earned_amount_minor` (the pay computed at sale time).
Optionally a per-service commission rate lives on `services`/`service_prices`.
Rationale: pay rates change; historical payroll must not move when they do —
this is the textbook "cannot be reconstructed retroactively" case, so the
snapshot must exist before any order is ever written. *Question:* where does the
rate live (service vs car_wash policy), and is `share` a percentage, a weight, or
an equal split inferred from the count?

**P5 — Explicit order money breakdown + discount provenance.**
On `orders`: `subtotal_minor` (pre-discount), `discount_amount_minor` (exact
money, not only a %), `total_minor`; plus `discount_type` enum
(`none|manual|loyalty|promo|subscription`) and `authorized_by?`
FK→auth.users. Rationale: "how much discount did we give and why/by whom" is a
core owner question; storing only `discount_pct` loses the exact figure to
rounding. *Question:* keep `discount_pct` too, or derive it? Define precisely
whether `price_amount_minor` (current column) is gross or net and reconcile it
with the new fields.

**P6 — Human-readable order number.**
A per-car-wash sequential `number` (or `order_no`) for receipts and lookup, UUID
stays the PK. *Question:* per car wash or per shift? Reset daily or monotonic?
How to generate it concurrently without gaps/races (sequence per car wash,
counter table, or `date + nextval`)? Decide the scalable approach.

**P7 — Time-based booking (reservation for a slot).**
Customers book a wash for a future time. Decide the **seam now**, not the full
feature (online booking is Phase 9). Two candidate shapes — pick one and justify:
(a) a dedicated `bookings` table — `car_wash_id`, `client_id?`/`car_id?` (may be
unknown until arrival), desired `service`/`package`, `scheduled_at`
(timestamptz), `status` enum (`requested|confirmed|arrived|cancelled|no_show`),
`box_id?`, converts into a `queued`/`in_progress` order on arrival; or
(b) extend `orders` with `scheduled_at` + a `booked` status. Weigh: does a
booking without a created order pollute order analytics? Is a separate table the
cleaner, more scalable seam? What is the minimum to lay now so Phase 9 is a clean
add and not a refactor?

**P8 — Capturing actors vs adding a cashier role.**
Even where admin = cashier, record **who did each money action**: `created_by`
(opened the order, exists), `received_by` (on the payment), `finished_by`
(closed, exists). Question: is adding a `cashier` value to the `membership_role`
enum worth it at the start, or is per-action actor capture enough and the role a
cheap later addition? Recommend.

**Also evaluate (secondary, scalability/correctness):**
- **Single open shift per car wash** — should a partial unique index on
  `shifts(car_wash_id) WHERE closed_at IS NULL` enforce it, given Phase 3 gates
  order creation on the current shift?
- **Cross-tenant integrity** — `orders.box_id`, `shift_id`, `client_car_id` can
  currently point at rows from a *different* car wash/org; only app code guards
  this. Are composite FKs on `(car_wash_id, id)` (or a CHECK/trigger) worth it,
  or is app-layer scoping enough? Judge cost vs benefit.
- **Walk-in friction** — `orders.client_car_id` is `NOT NULL`, forcing a
  client+car row for every anonymous "washed and left" car. Is that the right
  default, or should an order allow an unidentified vehicle (e.g. plate-only,
  nullable client)? This is a high-frequency path — decide deliberately.

## 7. Evaluation rubric

For every item produce: **Verdict** (Accept / Modify / Reject / Defer-to-later-phase),
**Car-wash rationale**, **Scalability & reversibility** (can a later migration add
this cleanly, or must it exist now?), **Recommended shape** (exact DDL intent),
**Cost / risk**, and **Alternatives considered**. Explicitly call out anything you
think is **over-engineered for the start** and should be deferred — the owner
wants critique, not agreement.

## 8. Deliverables

1. A **decision document** at `docs/ai/phase-1.6-decisions.md` (ADR-style): one
   section per proposal (P1–P8 + secondary), each with the rubric fields above.
2. A **recommended final data model** for the accepted items: tables, columns,
   types, FKs (with on-delete), indexes, constraints, and new enums — written as
   a precise spec another engineer could implement without guessing.
3. A proposed **migration & Conventional-Commit sequence** (0006+), each commit
   with a working upgrade/downgrade described — as a *plan*, not executed code.
4. **Open questions for the owner** — the few decisions that need a human call
   (e.g. commission policy location, order-number reset rule, booking scope).

End with a clear **recommendation summary**: what to lay in the bones now, what
to defer, and the one-line scalability justification for each "now".

## 9. Guardrails

- **Review and plan only.** Do not create migrations/models or touch the DB until
  the owner approves the decisions. Do not start Phase 2/3. Do not touch
  API/auth/frontend. Stay strictly on the data model.
- Respect every invariant in §4. Do not re-propose post-MVP phases (8–12) as new.
- **Report in Russian**: summarize your verdicts, the reasoning, and the open
  questions for the owner. Keep the decision doc itself in English (repo
  convention). STOP after the report.
