# Phase 0 — Foundations: standalone execution prompt

> Paste the block below into a fresh Claude Code session opened **inside this
> repository** (`carswash/`). It is self-contained: it tells the agent to read
> the committed docs first, then execute Phase 0 only.

---

You are an expert build/release engineer. You are working in an existing git
repository (the current working directory) for **CarsWash**, a 2026 rebuild of a
multi-tenant SaaS for car-wash networks. The planning is already committed. Your
job is **Phase 0 — Foundations only**. Do not implement any domain feature,
database schema, or auth.

## Step 1 — Read before doing anything

Read these committed files in full and obey them. They are binding:

- `docs/ARCHITECTURE.md` — system design, three-level tenancy
  (organization → car_washes → memberships), locale/currency/timezone
  independence, the stack (§10), and repo layout.
- `docs/CONVENTIONS.md` — git workflow, Conventional Commits, code style,
  quality gates, the AI Execution Protocol (§6), and the Definition of Done.
- `docs/ROADMAP.md` — go to **"Phase 0 — Foundations"** for the authoritative
  scope, deliverables, acceptance criteria, and commit sequence.

If anything in this prompt seems to conflict with those docs, the docs win —
ask before proceeding.

## Step 2 — Objective

Produce a clean **polyglot monorepo** where the `web` (Next 15) and `api`
(FastAPI) apps each start locally and pass all quality gates, with conventions
and CI wired **before** any feature work.

## Hard constraints (do not violate)

- All code, comments, commits, branch names, and docs are in **English**.
  Report your final summary to the user in **Russian**.
- Use **Conventional Commits**, one logical change per commit, following the
  commit sequence below. Commit messages are linted by commitlint.
- Deploy target is **Vercel** for both web and the FastAPI api. Keep both
  Vercel-compatible, but **do not add deployment config now** — that is Phase 7.
- **No secrets** in code or commits. Provide `.env.example` files only.
- Respect the core principles even in setup: no business strings in the backend,
  money is minor-units + currency, timestamps are UTC. (No domain code yet, but
  don't scaffold anything that contradicts these.)
- **Stop at the phase boundary.** Do not start Phase 1.

## Step 3 — Deliverables and exact setup

**Tooling versions — `mise.toml`** at repo root pinning: Node 22 (LTS), pnpm
(latest 10.x), Python 3.12, uv (latest). The documented dev flow must work after
`mise install`.

**Monorepo (JS side) — pnpm workspaces.**
- `pnpm-workspace.yaml` including `apps/web` and `packages/shared`
  (the Python `apps/api` is intentionally **not** a pnpm package).
- Root `package.json` with dev tooling: `@commitlint/cli`,
  `@commitlint/config-conventional`, `lefthook`, and convenience scripts.

**`apps/web` — Next 15.**
- Scaffold with `create-next-app@latest`: App Router, TypeScript, Tailwind CSS
  v4, `src` dir, import alias `@/*`, pnpm. Disable the default ESLint (we use
  Biome). Remove any ESLint/Prettier artifacts it adds.
- Initialize **shadcn/ui** (`pnpm dlx shadcn@latest init`) with sensible
  defaults; add one component (e.g. `button`) to prove it works.
- A placeholder home page that renders the project name.

**`apps/api` — FastAPI.**
- A `uv` project (`uv init`). Runtime deps: `fastapi`, `uvicorn[standard]`,
  `pydantic-settings`. Dev deps: `ruff`, `mypy`, `pytest`, `httpx`.
- App at `apps/api/app/main.py`: a FastAPI instance with OpenAPI enabled and
  `GET /health` returning `{"status": "ok"}`.
- One pytest checking `/health` returns 200 and the expected body.

**`packages/shared` — stub.**
- A minimal TS package (`package.json`, `tsconfig.json`, `src/index.ts`) that
  will later hold the generated OpenAPI client and shared constants. Export a
  placeholder for now.

**Quality tooling.**
- **Biome** (`biome.json` at root) for lint+format of TS in `apps/web` and
  `packages/shared`. `strict`-friendly config.
- **Ruff + mypy** configured in `apps/api/pyproject.toml`; mypy in strict mode.
- **Lefthook** (`lefthook.yml`): `pre-commit` runs fast checks on staged files
  — Biome check (web/shared) and Ruff check+format (api). `commit-msg` runs
  commitlint with `config-conventional`. Keep pre-commit fast (no full builds);
  heavier checks (tsc, mypy, pytest, build) run in CI.
- `commitlint.config.js` extending `@commitlint/config-conventional`. Optionally
  restrict scopes to the set listed in CONVENTIONS.md §2.

**CI — `.github/workflows/ci.yml`** (runs on PRs to `main`):
- `web` job: setup pnpm+node, install, `biome ci`, `tsc --noEmit`, `next build`.
- `api` job: setup uv+python, `uv sync`, `ruff check`, `ruff format --check`,
  `mypy`, `pytest`.

**Env examples.**
- `apps/web/.env.example`: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`.
- `apps/api/.env.example`: `DATABASE_URL` (pooled, 6543), `DIRECT_URL` (5432),
  `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `ENV`.

**Docs.** Update the README "Getting started" section with the real
`mise install` + dev commands for both apps.

## Step 4 — Commit sequence (Conventional Commits)

Work branch: `chore/phase-0-foundations`. Commit in this order, each green:

```
chore(repo): initialize monorepo layout and tool versions
build(web): scaffold next 15 app with tailwind and shadcn
build(api): scaffold fastapi app with health endpoint
chore(repo): add biome, ruff, mypy, lefthook, commitlint
ci(repo): add lint, typecheck, test, build pipeline
docs(repo): document dev setup and add env examples
```

End commit messages with the trailer:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## Step 5 — Definition of Done (verify, then report)

All must hold:

1. `mise install` succeeds; documented dev commands start **both** apps.
2. `GET /health` returns `{"status":"ok"}`; FastAPI `/docs` loads.
3. The web placeholder page renders.
4. Local gate is green: Biome, `tsc --noEmit`, `next build`, Ruff, mypy, pytest.
5. A deliberately malformed commit message (e.g. `"updated stuff"`) is rejected
   by commitlint; a Conventional Commit is accepted.
6. CI workflow is present and structured to run the above on PRs.
7. No secrets committed; only `.env.example` files exist.

Then **report to the user in Russian**: what was created, the exact commands to
run web and api locally, and confirmation that the gate and commitlint work.
Finally, **stop** — do not begin Phase 1; wait for explicit go-ahead.
