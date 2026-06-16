"""Application configuration sourced from the environment (pydantic-settings).

No secrets live in code. Real values come from the environment or a local
``.env`` file (git-ignored); see ``.env.example`` for the expected keys.

Database connection strings use the exact names Supabase/Vercel provide:
``POSTGRES_URL`` (Supavisor transaction pooler — runtime) and
``POSTGRES_URL_NON_POOLING`` (direct, port 5432 — Alembic DDL).
"""

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

    # Supabase auth secrets (used from Phase 2 onward; never exposed to the web).
    supabase_jwt_secret: str | None = None
    supabase_service_role_key: str | None = None


settings = Settings()
