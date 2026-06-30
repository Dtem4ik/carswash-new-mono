"""FastAPI application entrypoint.

OpenAPI is enabled by default: the schema is served at ``/openapi.json`` and
the interactive docs at ``/docs``. The API returns canonical data and stable
codes only — never localized prose (see ARCHITECTURE.md §8). The OpenAPI schema
is the single source of truth for the web's generated client (packages/shared).
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import boxes, catalog, lookup, me, members, orders, pricing, shifts
from app.config import settings
from app.deps import dispose_engine, init_engine


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Warm the DB pool once at startup and reuse it across requests; dispose on
    shutdown. Skipped when no database is configured (CI / OpenAPI export)."""
    if settings.postgres_url or settings.postgres_url_non_pooling:
        init_engine()
    try:
        yield
    finally:
        await dispose_engine()


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

# The web calls the API cross-origin with a Bearer token + X-Car-Wash-Id header.
# MVP: allow all origins (no cookies are used cross-site); tighten in Phase 7.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(me.router)
app.include_router(catalog.router)
app.include_router(pricing.router)
app.include_router(boxes.router)
app.include_router(lookup.router)
app.include_router(shifts.router)
app.include_router(orders.router)
app.include_router(members.router)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness probe used by deploys and uptime checks."""
    return {"status": "ok"}
