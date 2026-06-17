"""Shift endpoints (car-wash-scoped): open + current.

Opening a shift requires ``shifts.manage`` and an opening cash float. The DB
partial-unique index (one open shift per car wash) is the source of truth — a
second open attempt is caught and returned as a clean 409. Shift CLOSE and till
reconciliation are Phase 3b.
"""

from __future__ import annotations

import datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.capabilities import Capability
from app.auth.guards import active_car_wash, require_capability
from app.auth.tenancy import TenantContext, get_tenant_context
from app.deps import get_session
from app.models.operations import Shift

router = APIRouter(tags=["shifts"])

_manage = require_capability(Capability.SHIFTS_MANAGE)


class ShiftOpen(BaseModel):
    opening_float_minor: int = Field(ge=0)


class ShiftOut(BaseModel):
    id: uuid.UUID
    car_wash_id: uuid.UUID
    opened_by: uuid.UUID
    opened_at: datetime.datetime
    closed_at: datetime.datetime | None
    opening_float_minor: int


@router.get("/shifts/current", response_model=ShiftOut | None)
async def current_shift(
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> Shift | None:
    car_wash_id = active_car_wash(ctx)
    return (
        await session.execute(
            select(Shift).where(
                Shift.car_wash_id == car_wash_id,
                Shift.closed_at.is_(None),
            )
        )
    ).scalar_one_or_none()


@router.post("/shifts/open", response_model=ShiftOut, dependencies=[Depends(_manage)])
async def open_shift(
    body: ShiftOpen,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> Shift:
    shift = Shift(
        car_wash_id=active_car_wash(ctx),
        opened_by=ctx.user_id,
        opening_float_minor=body.opening_float_minor,
    )
    session.add(shift)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        # uq_shifts_one_open: a shift is already open for this car wash.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "shift.already_open"},
        ) from exc
    await session.refresh(shift)
    return shift
