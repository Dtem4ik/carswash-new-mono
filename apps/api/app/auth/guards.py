"""Authorization guards used by routers.

``require_capability`` is a dependency factory used in a route's ``dependencies=``
list to gate writes by the capability matrix. ``active_car_wash`` resolves the
car wash a car-wash-scoped operation targets, erroring cleanly when none is
selected. Both keep tenant scoping and authz out of the handler bodies.
"""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable

from fastapi import Depends, HTTPException, status

from app.auth.tenancy import TenantContext, get_tenant_context


def require_capability(capability: str) -> Callable[..., Awaitable[TenantContext]]:
    """Dependency that 403s unless the caller's role grants ``capability``."""

    async def _dependency(
        ctx: TenantContext = Depends(get_tenant_context),
    ) -> TenantContext:
        if capability not in ctx.capabilities:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "auth.forbidden", "capability": capability},
            )
        return ctx

    return _dependency


def active_car_wash(ctx: TenantContext) -> uuid.UUID:
    """The car wash a car-wash-scoped request targets, or 400 if none is active."""
    if ctx.active_car_wash_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "tenant.car_wash_required"},
        )
    return ctx.active_car_wash_id
