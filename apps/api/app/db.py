"""Async database engine and session factory (runtime).

Two pooling strategies, selected by ``settings.db_pool_mode``:

- ``warm`` (default) — a long-lived, kept-warm pool over the **direct/session**
  connection (``POSTGRES_URL_NON_POOLING``). Prepared statements are enabled
  (the direct connection is not a transaction pooler), so repeated queries skip
  re-parsing. The pool is created once and reused across requests and, on Vercel
  Fluid Compute, across invocations of a warm instance.
- ``serverless`` — the Supavisor **transaction pooler** (``POSTGRES_URL``) with
  ``NullPool`` and prepared statements disabled (``statement_cache_size=0``),
  for short-lived stateless invocations.

DDL (Alembic) always uses the direct connection via the sync psycopg driver; see
``migrations/env.py``. This module never touches that path.
"""

import ssl

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.config import settings

# Keep a warm pool small but non-trivial so concurrent requests don't serialize;
# recycle connections before any idle server-side timeout closes them.
_WARM_POOL_SIZE = 5
_WARM_MAX_OVERFLOW = 10
_WARM_POOL_RECYCLE_SECONDS = 1800


def _async_url(raw: str) -> str:
    """Normalize a Postgres URL to the asyncpg driver scheme.

    The libpq-style query string (``sslmode``, Supabase's ``supa`` marker, …) is
    dropped: asyncpg rejects those keywords, and SSL is supplied via
    ``connect_args`` instead.
    """
    base = raw if raw.startswith("postgresql+asyncpg://") else None
    if base is None:
        _, _, rest = raw.partition("://")
        base = f"postgresql+asyncpg://{rest}"
    return base.split("?", 1)[0]


def _ssl_context() -> ssl.SSLContext:
    # Encrypt the connection without enforcing certificate verification against
    # the pooler/host name.
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def create_engine() -> AsyncEngine:
    """Build the async engine for the runtime, per ``settings.db_pool_mode``."""
    ssl_ctx = _ssl_context()

    if settings.db_pool_mode == "serverless":
        if not settings.postgres_url:
            raise RuntimeError("POSTGRES_URL is not configured")
        # Transaction pooler: hold no connections; disable prepared statements
        # (Supavisor transaction mode does not support them).
        return create_async_engine(
            _async_url(settings.postgres_url),
            connect_args={"statement_cache_size": 0, "ssl": ssl_ctx},
            poolclass=NullPool,
        )

    # Warm (default): prefer the direct/session connection so prepared statements
    # work; fall back to the pooler (statements disabled) if it is the only URL.
    direct = settings.postgres_url_non_pooling
    if direct:
        return create_async_engine(
            _async_url(direct),
            connect_args={"ssl": ssl_ctx},
            pool_size=_WARM_POOL_SIZE,
            max_overflow=_WARM_MAX_OVERFLOW,
            pool_pre_ping=True,
            pool_recycle=_WARM_POOL_RECYCLE_SECONDS,
        )

    if not settings.postgres_url:
        raise RuntimeError("POSTGRES_URL is not configured")
    return create_async_engine(
        _async_url(settings.postgres_url),
        connect_args={"statement_cache_size": 0, "ssl": ssl_ctx},
        pool_size=_WARM_POOL_SIZE,
        max_overflow=_WARM_MAX_OVERFLOW,
        pool_pre_ping=True,
        pool_recycle=_WARM_POOL_RECYCLE_SECONDS,
    )


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Build a session factory bound to ``engine``."""
    return async_sessionmaker(engine, expire_on_commit=False)
