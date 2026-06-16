"""FastAPI application entrypoint.

OpenAPI is enabled by default: the schema is served at ``/openapi.json`` and
the interactive docs at ``/docs``. The API returns canonical data and stable
codes only — never localized prose (see ARCHITECTURE.md §8).
"""

from fastapi import FastAPI

from app.config import settings

app = FastAPI(title=settings.app_name, version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness probe used by deploys and uptime checks."""
    return {"status": "ok"}
