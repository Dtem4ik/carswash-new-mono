"""``GET /me`` — the resolved tenant context for the authenticated user.

Returns canonical data and stable codes only (role + capability codes); the web
localizes them. This is the only domain-ish endpoint in Phase 2; real domain
routers arrive in Phase 3 and reuse the same ``TenantContext`` dependency.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth.tenancy import TenantContext, get_tenant_context
from app.models.enums import MembershipRole

router = APIRouter(tags=["auth"])


class ProfileOut(BaseModel):
    id: uuid.UUID
    full_name: str | None
    locale: str | None


class OrganizationOut(BaseModel):
    id: uuid.UUID
    name: str
    default_currency: str
    default_locale: str


class CarWashOut(BaseModel):
    id: uuid.UUID
    name: str
    currency: str
    timezone: str


class MeResponse(BaseModel):
    user: ProfileOut
    organization: OrganizationOut
    role: MembershipRole
    accessible_car_washes: list[CarWashOut]
    active_car_wash_id: uuid.UUID | None
    capabilities: list[str]


@router.get("/me", response_model=MeResponse)
async def get_me(ctx: TenantContext = Depends(get_tenant_context)) -> MeResponse:
    return MeResponse(
        user=ProfileOut(
            id=ctx.profile.id,
            full_name=ctx.profile.full_name,
            locale=ctx.profile.locale,
        ),
        organization=OrganizationOut(
            id=ctx.organization.id,
            name=ctx.organization.name,
            default_currency=ctx.organization.default_currency,
            default_locale=ctx.organization.default_locale,
        ),
        role=ctx.role,
        accessible_car_washes=[
            CarWashOut(id=cw.id, name=cw.name, currency=cw.currency, timezone=cw.timezone)
            for cw in ctx.car_washes
        ],
        active_car_wash_id=ctx.active_car_wash_id,
        capabilities=sorted(ctx.capabilities),
    )
