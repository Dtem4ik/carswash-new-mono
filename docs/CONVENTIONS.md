# Conventions & AI Execution Protocol

> All code, comments, commits, branch names, and documentation are written in
> **English**. (Conversations with the product owner happen in Russian; that is
> separate from the artifacts.)

This document is binding for every contributor — human or AI agent.

---

## 1. Git workflow

- **Trunk-based.** `main` is always releasable. Work happens on short-lived
  branches merged via PR.
- **Branch naming:** `<type>/<scope>-<short-slug>`
  e.g. `feat/orders-create-flow`, `fix/auth-jwt-expiry`, `chore/ci-setup`.
- **One phase = one or more PRs.** Keep PRs reviewable (< ~400 changed lines
  where possible). A phase is "done" only when its acceptance criteria pass.
- **Rebase, don't merge-commit** feature branches onto `main`. Linear history.

---

## 2. Conventional Commits

Format:

```
<type>(<scope>): <short summary in imperative mood>

[optional body — what & why, not how]
[optional footer — BREAKING CHANGE:, Refs:, Closes #]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`,
`ci`, `chore`, `revert`.

**Scopes (this repo):** `web`, `api`, `db`, `auth`, `orders`, `boxes`, `shifts`,
`pricing`, `stats`, `tenancy`, `i18n`, `shared`, `ci`, `repo`, `docs`.

**Rules**
- Summary ≤ 72 chars, imperative ("add", not "added"/"adds"), no trailing period.
- One logical change per commit. Don't mix refactor + feature.
- Breaking changes: add `!` after scope **and** a `BREAKING CHANGE:` footer.
- Commits must build and pass lint/type/tests locally before pushing.

**Examples**
```
feat(orders): add create-order flow with queue assignment
fix(auth): reject expired supabase jwt with 401
db(tenancy): add organizations, car_washes, memberships tables
docs(api): document order status state machine
refactor(pricing)!: store money as minor units + currency

BREAKING CHANGE: order.price is now price_amount_minor (int) + currency.
```

Commit messages are linted by **commitlint** via a Lefthook `commit-msg` hook.

---

## 3. Code style & quality gates

**TypeScript (web, shared)**
- **Biome** for lint + format (no separate ESLint/Prettier).
- `strict: true`. No `any` without an inline justification comment.
- Components: server components by default; `"use client"` only when needed.

**Python (api)**
- **Ruff** for lint + format. **mypy** in strict mode.
- Full type hints. Pydantic v2 models for all I/O boundaries.
- Async SQLAlchemy; no sync DB calls in request handlers.

**Both**
- No secrets in code or commits. Config via env (`pydantic-settings` / Next env).
- No business-facing strings in the backend (codes only — see ARCHITECTURE §8).
- Money as integer minor units + currency. Timestamps UTC. No exceptions.

**Pre-commit (Lefthook)** runs: format check, lint, type-check on staged files,
plus commitlint on the message.

---

## 4. Testing

- **API:** `pytest`. Every endpoint has at least one happy-path and one
  auth/tenancy-isolation test. Business rules (queue promotion, price
  calculation, shift gating) have unit tests.
- **Web:** Vitest for logic/util; Playwright for critical e2e flows (login,
  create order, close order) — introduced in Phase 6.
- A phase cannot be marked done if its new code lowers coverage of touched
  modules or leaves a known failing test.

---

## 5. Definition of Done (per phase)

A phase is **done** when all are true:

1. All acceptance criteria in `ROADMAP.md` for that phase pass.
2. Lint, format, type-check, and tests are green locally and in CI.
3. New endpoints are reflected in the OpenAPI schema; the web client is
   regenerated (`packages/shared`).
4. Docs updated: relevant sections of `ARCHITECTURE.md` and any module README.
5. History is a clean sequence of Conventional Commits; PR merged to `main`.
6. No secrets, no `TODO` left without an issue reference.

---

## 6. AI execution protocol

When an AI agent executes a phase, it MUST:

1. **Read first.** Read `docs/ARCHITECTURE.md`, this file, and the target phase
   section in `docs/ROADMAP.md` before writing any code.
2. **Confirm scope.** Restate the phase objective and list the files it will
   create/modify. If a decision is ambiguous and would cause rework, ask before
   coding — do not guess on foundational choices.
3. **Work in small commits.** Follow the commit sequence suggested in the phase.
   Each commit is one logical, green change with a Conventional Commit message.
4. **Respect the principles.** Locale/currency/timezone independence, canonical
   data + codes out, tenant scoping on every operational query, money as minor
   units, UTC time. Never violate these for convenience.
5. **Keep the contract in sync.** After backend changes, regenerate the OpenAPI
   client into `packages/shared`. The web never hand-writes API types.
6. **Test as you go.** Add tests with the code, not after. Run the full gate
   before declaring the phase done.
7. **Update docs.** Reflect any deviation from the plan back into the docs in
   the same PR (the plan is living, but drift must be written down).
8. **Report in Russian.** The summary back to the product owner is in Russian;
   the artifacts stay English.
9. **Stop at the phase boundary.** Do not start the next phase without explicit
   go-ahead.

---

## 7. Environments & secrets

- `.env.example` files are committed; real `.env` files are git-ignored.
- Supabase keys: `SERVICE_ROLE_KEY` only ever on the API (server) side.
  `ANON_KEY` may reach the web (auth + realtime).
- Database access from the API uses the **pooled** connection string
  (Supavisor, port 6543) at runtime and the **direct** string (5432) for
  Alembic migrations.
