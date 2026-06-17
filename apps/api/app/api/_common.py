"""Small helpers shared by routers."""

from __future__ import annotations

from fastapi import HTTPException, status


def not_found() -> HTTPException:
    """404 with a stable code (also used to hide cross-tenant rows)."""
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "not_found"})
