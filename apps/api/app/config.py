"""Application configuration sourced from the environment (pydantic-settings).

No secrets live in code. Real values come from the environment or a local
``.env`` file (git-ignored); see ``.env.example`` for the expected keys.

Database connection strings use the exact names Supabase/Vercel provide:
``POSTGRES_URL`` (Supavisor transaction pooler — runtime) and
``POSTGRES_URL_NON_POOLING`` (direct, port 5432 — Alembic DDL).
"""

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration loaded from environment variables / ``.env``."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "CarsWash API"
    env: str = "development"

    # Database. Optional so the app (and CI) can import settings without a DB;
    # consumers that need a connection assert presence at use time.
    postgres_url: str | None = None
    postgres_url_non_pooling: str | None = None

    # Runtime connection strategy (see app/db.py):
    # - "warm" (default): a long-lived, kept-warm pool over the direct/session
    #   connection, with prepared statements enabled. Best for a persistent
    #   server and for Vercel Fluid Compute, where instances stay warm and reuse
    #   the pool across invocations.
    # - "serverless": the Supavisor transaction pooler with NullPool and
    #   prepared statements disabled, for short-lived stateless invocations.
    db_pool_mode: str = "warm"

    # Supabase project URL — used to derive the JWKS endpoint and admin API base.
    # Accepts the SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL env name.
    supabase_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
    )

    # Supabase auth secrets (used from Phase 2 onward; never exposed to the web).
    # HS256 JWT secret (fallback when the project signs symmetrically).
    supabase_jwt_secret: str | None = None
    # Service-role key — server-side only; used by the seed admin API.
    supabase_service_role_key: str | None = None

    # Expected audience claim on Supabase-issued access tokens.
    supabase_jwt_audience: str = "authenticated"


settings = Settings()
