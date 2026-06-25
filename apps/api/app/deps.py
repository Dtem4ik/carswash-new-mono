"""Shared FastAPI dependencies: the async DB session.

The engine and session factory are created once per process — eagerly from the
app's lifespan handler (see ``app/main.py``), or lazily on first use so tests,
CI, and the OpenAPI export can import and start without a database configured.
Reusing one warm engine across requests (and, on Fluid Compute, across
invocations) is the point: a fresh engine per request would re-establish the
pool every time.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.db import create_engine, create_session_factory

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def init_engine() -> async_sessionmaker[AsyncSession]:
    """Create the process-wide engine + session factory once (idempotent)."""
    global _engine, _session_factory
    if _session_factory is None:
        _engine = create_engine()
        _session_factory = create_session_factory(_engine)
    return _session_factory


async def dispose_engine() -> None:
    """Tear the pool down on shutdown (closes the warm connections)."""
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None


def _factory() -> async_sessionmaker[AsyncSession]:
    return init_engine()


async def get_session() -> AsyncIterator[AsyncSession]:
    """Yield an async session for the duration of a request."""
    async with _factory()() as session:
        yield session
