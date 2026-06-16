"""Alembic environment.

DDL runs over the DIRECT connection (``POSTGRES_URL_NON_POOLING``, port 5432) —
never the transaction pooler. The ``auth`` schema is Supabase-managed and is
excluded from autogenerate so our migrations never touch ``auth.users``.
"""

from __future__ import annotations

from typing import Any

from alembic import context
from sqlalchemy import create_engine

from app.config import settings
from app.models import Base

config = context.config
target_metadata = Base.metadata


def _sync_url() -> str:
    """Direct (non-pooled) URL normalized to the psycopg driver, SSL required."""
    raw = settings.postgres_url_non_pooling
    if not raw:
        raise RuntimeError("POSTGRES_URL_NON_POOLING is not configured")
    scheme, _, rest = raw.partition("://")
    url = f"postgresql+psycopg://{rest}"
    if "sslmode=" not in url:
        url += ("&" if "?" in url else "?") + "sslmode=require"
    return url


def include_object(
    obj: Any, name: str | None, type_: str, reflected: bool, compare_to: Any
) -> bool:
    """Skip the Supabase-managed ``auth`` schema during autogenerate."""
    return getattr(obj, "schema", None) != "auth"


def run_migrations_offline() -> None:
    context.configure(
        url=_sync_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        include_object=include_object,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(_sync_url(), future=True)
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
        )
        with context.begin_transaction():
            context.run_migrations()
    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
