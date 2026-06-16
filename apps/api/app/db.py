"""Async database engine and session factory (runtime).

The runtime connects through ``POSTGRES_URL`` — the Supavisor transaction
pooler — so prepared statements are disabled (``statement_cache_size=0``) and
SSL is required. DDL (Alembic) uses the direct connection instead; see
``migrations/env.py``.
"""

import ssl

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import settings


def _async_url(raw: str) -> str:
    """Normalize a Postgres URL to the asyncpg driver scheme."""
    if raw.startswith("postgresql+asyncpg://"):
        return raw
    scheme, _, rest = raw.partition("://")
    return f"postgresql+asyncpg://{rest}"


def create_engine() -> AsyncEngine:
    """Build the async engine for the pooled runtime connection."""
    if not settings.postgres_url:
        raise RuntimeError("POSTGRES_URL is not configured")

    # Encrypt the connection without enforcing certificate verification against
    # the pooler hostname.
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE

    return create_async_engine(
        _async_url(settings.postgres_url),
        connect_args={"statement_cache_size": 0, "ssl": ssl_ctx},
        pool_pre_ping=True,
    )


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Build a session factory bound to ``engine``."""
    return async_sessionmaker(engine, expire_on_commit=False)
