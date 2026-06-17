"""Box endpoints (car-wash-scoped).

Lists the active car wash's boxes with their current status. Reads are open to
any role in scope; create/update/archive require ``boxes.manage``. A box id from
another car wash 404s.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api._common import not_found
from app.auth.capabilities import Capability
from app.auth.guards import active_car_wash, require_capability
from app.auth.tenancy import TenantContext, get_tenant_context
from app.deps import get_session
from app.models.enums import BoxStatus
from app.models.operations import Box

router = APIRouter(tags=["boxes"])

_manage = require_capability(Capability.BOXES_MANAGE)


class BoxCreate(BaseModel):
    name: str = Field(min_length=1)
    sort: int = 0


class BoxUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    sort: int | None = None


class BoxOut(BaseModel):
    id: uuid.UUID
    car_wash_id: uuid.UUID
    name: str
    status: BoxStatus
    active_order_id: uuid.UUID | None
    sort: int
    is_active: bool


async def _box_or_404(session: AsyncSession, box_id: uuid.UUID, car_wash_id: uuid.UUID) -> Box:
    obj = await session.get(Box, box_id)
    if obj is None or obj.car_wash_id != car_wash_id:
        raise not_found()
    return obj


@router.get("/boxes", response_model=list[BoxOut])
async def list_boxes(
    include_inactive: bool = False,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> list[Box]:
    car_wash_id = active_car_wash(ctx)
    stmt = select(Box).where(Box.car_wash_id == car_wash_id)
    if not include_inactive:
        stmt = stmt.where(Box.is_active.is_(True))
    stmt = stmt.order_by(Box.sort, Box.name)
    return list((await session.execute(stmt)).scalars())


@router.post("/boxes", response_model=BoxOut, dependencies=[Depends(_manage)])
async def create_box(
    body: BoxCreate,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> Box:
    obj = Box(car_wash_id=active_car_wash(ctx), name=body.name, sort=body.sort)
    session.add(obj)
    await session.commit()
    await session.refresh(obj)
    return obj


@router.patch("/boxes/{box_id}", response_model=BoxOut, dependencies=[Depends(_manage)])
async def update_box(
    box_id: uuid.UUID,
    body: BoxUpdate,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> Box:
    obj = await _box_or_404(session, box_id, active_car_wash(ctx))
    if body.name is not None:
        obj.name = body.name
    if body.sort is not None:
        obj.sort = body.sort
    await session.commit()
    await session.refresh(obj)
    return obj


@router.post("/boxes/{box_id}/archive", response_model=BoxOut, dependencies=[Depends(_manage)])
async def archive_box(
    box_id: uuid.UUID,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> Box:
    obj = await _box_or_404(session, box_id, active_car_wash(ctx))
    obj.is_active = False
    await session.commit()
    await session.refresh(obj)
    return obj
