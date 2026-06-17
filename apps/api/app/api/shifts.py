"""Shift endpoints (car-wash-scoped): open, current, cash movements, close.

Opening a shift requires ``shifts.manage`` and an opening cash float; the DB
partial-unique index (one open shift per car wash) is the source of truth — a
second open is returned as 409. Cash movements (``cash.record``) attach to the
open shift. Closing (``shifts.manage``) reconciles the till: it refuses while
orders are still open, then snapshots expected cash and reports the variance.
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
from app.models.enums import CashMovementType
from app.models.operations import CashMovement, Shift

router = APIRouter(tags=["shifts"])

_manage = require_capability(Capability.SHIFTS_MANAGE)
_cash = require_capability(Capability.CASH_RECORD)


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.UTC)


class ShiftOpen(BaseModel):
    opening_float_minor: int = Field(ge=0)


class ShiftOut(BaseModel):
    id: uuid.UUID
    car_wash_id: uuid.UUID
    opened_by: uuid.UUID
    closed_by: uuid.UUID | None
    opened_at: datetime.datetime
    closed_at: datetime.datetime | None
    opening_float_minor: int
    counted_cash_minor: int | None
    closing_expected_minor: int | None


class CashMovementCreate(BaseModel):
    type: CashMovementType
    amount_minor: int = Field(ge=0)
    reason: str | None = None
    payee_user_id: uuid.UUID | None = None


class CashMovementOut(BaseModel):
    id: uuid.UUID
    shift_id: uuid.UUID
    type: CashMovementType
    amount_minor: int
    reason: str | None
    payee_user_id: uuid.UUID | None
    created_by: uuid.UUID
    created_at: datetime.datetime


async def _open_shift(session: AsyncSession, car_wash_id: uuid.UUID) -> Shift | None:
    return (
        await session.execute(
            select(Shift).where(Shift.car_wash_id == car_wash_id, Shift.closed_at.is_(None))
        )
    ).scalar_one_or_none()


@router.get("/shifts/current", response_model=ShiftOut | None)
async def current_shift(
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> Shift | None:
    return await _open_shift(session, active_car_wash(ctx))


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
            status_code=status.HTTP_409_CONFLICT, detail={"code": "shift.already_open"}
        ) from exc
    await session.refresh(shift)
    return shift


@router.post(
    "/shifts/current/cash-movements", response_model=CashMovementOut, dependencies=[Depends(_cash)]
)
async def record_cash_movement(
    body: CashMovementCreate,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> CashMovement:
    car_wash_id = active_car_wash(ctx)
    shift = await _open_shift(session, car_wash_id)
    if shift is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "shift.not_open"}
        )
    movement = CashMovement(
        shift_id=shift.id,
        car_wash_id=car_wash_id,
        type=body.type,
        amount_minor=body.amount_minor,
        reason=body.reason,
        payee_user_id=body.payee_user_id,
        created_by=ctx.user_id,
    )
    session.add(movement)
    await session.commit()
    await session.refresh(movement)
    return movement
