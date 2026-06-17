"""Shared FastAPI dependencies: the async DB session.

The engine and session factory are created lazily on first use so the app (and
CI, and the OpenAPI export) can import and start without a database configured.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db import create_engine, create_session_factory

_session_factory: async_sessionmaker[AsyncSession] | None = None


def _factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = create_session_factory(create_engine())
    return _session_factory


async def get_session() -> AsyncIterator[AsyncSession]:
    """Yield an async session for the duration of a request."""
    async with _factory()() as session:
        yield session
