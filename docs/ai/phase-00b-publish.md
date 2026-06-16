# Phase 0b — Publish to GitHub + Vercel: standalone execution prompt

> Runs after Phase 0, before Phase 1. Goal: put the repo on GitHub (with proper
> metadata + CI live) and stand up continuous deployment on Vercel for the
> trivial skeleton — to activate the quality gate and de-risk the deploy
> pipeline early. Paste the block below into a fresh Claude Code session opened
> inside this repository.

---

You are a DevOps/release engineer. You are working in an existing git repository
(the current working directory) for **CarsWash**, a 2026 monorepo rebuild
(Next 16 web + FastAPI api). **Phase 0 (Foundations) is complete** and committed.
Your job is **Phase 0b — publish to GitHub and set up Vercel deployment for the
skeleton**. Do not implement any domain feature, database schema, or auth — that
is Phase 1+.

## Step 1 — Read first (binding)

- `docs/ARCHITECTURE.md` — §9 deployment topology, §10 stack, repo layout.
- `docs/CONVENTIONS.md` — git workflow, Conventional Commits, AI Execution
  Protocol (§6), environments & secrets (§7).
- `docs/ROADMAP.md` — confirm what Phase 7 (Deploy MVP) owns, so you pull forward
  only the minimum needed now.

If anything conflicts with the docs, the docs win — ask before proceeding.

## Step 2 — Hard constraints

- English for all code/commits/docs. Final summary to the user in **Russian**.
- **No secrets in git.** Only `.env.example` files. Do not add real Supabase
  keys anywhere; the app skeleton needs none to boot.
- Use **Conventional Commits**. Use the `gh` CLI for GitHub and the `vercel` CLI
  for Vercel. The Vercel team is **dtem4iks-projects**
  (`team_GFdQ1qy8JAmh9XDjyLqlz1CV`).
- The GitHub repo is **public** (portfolio/showcase), but the product stays
  **proprietary**: keep the "all rights reserved" stance (no OSS license file —
  do not add MIT/Apache/etc.). Public means visible, not reusable. Be extra
  strict that no secrets, keys, or customer data ever enter git.
- Stop at the phase boundary. Do not begin Phase 1.

## Step 3 — Git: consolidate onto `main`

Current state: work sits on branch `chore/phase-0-foundations`; there may be no
`main` yet. Bootstrap cleanly:

1. Ensure a `main` branch exists containing **all** current commits (fast-forward
   merge the phase-0 branch into `main`; keep linear history).
2. Make `main` the default branch.
3. Keep the Conventional-Commit history intact (do not squash the existing work).

From Phase 1 onward the workflow is PR-based; this bootstrap push to `main` is the
one exception (establishing the repo).

## Step 4 — Create the GitHub repository

Use `gh repo create` with:

- **Name:** `carswash-new-mono`
- **Visibility:** public (portfolio/showcase; keep the proprietary license
  stance — do not add an OSS license file)
- **Description:** `Multi-tenant SaaS for car-wash networks — monorepo (Next 16 web + FastAPI api). 2026 rebuild.`
- Set it as the `origin` remote and push `main`.

Then configure metadata:

- **Topics** (repo tags), via `gh repo edit --add-topic`:
  `saas`, `car-wash`, `multi-tenant`, `monorepo`, `nextjs`, `react`,
  `typescript`, `fastapi`, `python`, `supabase`, `vercel`.
- **Issue labels** for phase tracking, via `gh label create` (idempotent —
  skip/duplicate gracefully):
  `phase-1-data-model`, `phase-2-auth`, `phase-3-api`, `phase-4-web`,
  `phase-5-stats`, `phase-6-hardening`, `phase-7-deploy`,
  plus `tenancy`, `i18n`, `infra`. Give them distinct colors and short
  descriptions.
- **Branch protection on `main`:** require a pull request and require the CI
  checks to pass before merge (use `gh api` for the branch protection rule).
  Do not require approvals (solo dev) but require status checks + up-to-date
  branches.

## Step 5 — Vercel: continuous deployment for the skeleton

This monorepo deploys as **two Vercel projects** in the `dtem4iks-projects`
team, both linked to the `carswash-new-mono` GitHub repo for auto-deploy
(production on push to `main`, preview on PRs):

1. **Web project**
   - Root Directory: `apps/web`. Framework preset: **Next.js**.
   - Node version: **24.x** (set via `engines.node` in `apps/web/package.json`
     if needed, or project settings).
   - No env vars required for the skeleton (the placeholder page is static).
2. **API project**
   - Root Directory: `apps/api`. Python runtime (zero-config). Add the **minimal
     Vercel config** required for FastAPI to serve on Vercel (e.g. an
     `apps/api/vercel.json` and/or the expected entrypoint exposing the
     `app` object) — this intentionally pulls a small slice of Phase 7 forward.
     Keep it minimal; full prod env + migrations remain Phase 7.
   - Python version: **3.13** (already pinned via `apps/api/.python-version` and
     `requires-python`).
   - No env vars required for `GET /health`.

Connect both projects to the GitHub repo so future pushes/PRs deploy
automatically. Do **not** wire Supabase env vars yet — that lands in Phase 2.

Any Vercel config you add must be committed with a Conventional Commit and must
not break the local `pnpm build:web` / api gate.

## Step 6 — Verify (then report)

All must hold:

1. `carswash-new-mono` exists on GitHub, **private**, with the description,
   topics, labels, and `main` as default + branch protection active.
2. `main` has the full Conventional-Commit history; `git push` is clean; the CI
   workflow runs on GitHub and is green.
3. The **web** production deployment is live on Vercel and renders the
   placeholder page.
4. The **api** production deployment is live and `GET /health` returns
   `{"status":"ok"}`; `/docs` loads.
5. Opening a test PR triggers CI + Vercel preview deployments (then close it).
6. No secrets committed anywhere; only `.env.example` files exist.

Then **report to the user in Russian**: the repo URL, both Vercel production
URLs, confirmation that CI runs and previews work, and any Vercel config you had
to add. Then **stop** — do not begin Phase 1.
