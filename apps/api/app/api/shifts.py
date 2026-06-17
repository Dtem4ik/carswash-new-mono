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
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.capabilities import Capability
from app.auth.guards import active_car_wash, require_capability
from app.auth.tenancy import TenantContext, get_tenant_context
from app.deps import get_session
from app.models.enums import CashMovementType, OrderStatus, PaymentKind, PaymentMethod
from app.models.operations import CashMovement, Order, Payment, Shift

router = APIRouter(tags=["shifts"])

_manage = require_capability(Capability.SHIFTS_MANAGE)
_cash = require_capability(Capability.CASH_RECORD)


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.UTC)


class ShiftOpen(BaseModel):
    opening_float_minor: int = Field(ge=0)


class ShiftClose(BaseModel):
    counted_cash_minor: int = Field(ge=0)


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


class ShiftCloseOut(BaseModel):
    shift: ShiftOut
    expected_minor: int
    counted_minor: int
    variance_minor: int


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


async def _net_cash_from_payments(session: AsyncSession, shift_id: uuid.UUID) -> int:
    """Cash received minus cash refunded across this shift's orders."""
    rows = (
        await session.execute(
            select(Payment.kind, func.coalesce(func.sum(Payment.amount_minor), 0))
            .join(Order, Order.id == Payment.order_id)
            .where(Order.shift_id == shift_id, Payment.method == PaymentMethod.cash)
            .group_by(Payment.kind)
        )
    ).all()
    received = refunded = 0
    for kind, total in rows:
        if kind == PaymentKind.payment:
            received = int(total)
        else:
            refunded = int(total)
    return received - refunded


async def _cash_movement_totals(session: AsyncSession, shift_id: uuid.UUID) -> dict[str, int]:
    rows = (
        await session.execute(
            select(CashMovement.type, func.coalesce(func.sum(CashMovement.amount_minor), 0))
            .where(CashMovement.shift_id == shift_id)
            .group_by(CashMovement.type)
        )
    ).all()
    return {kind.value: int(total) for kind, total in rows}


@router.post("/shifts/close", response_model=ShiftCloseOut, dependencies=[Depends(_manage)])
async def close_shift(
    body: ShiftClose,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> ShiftCloseOut:
    car_wash_id = active_car_wash(ctx)
    shift = (
        await session.execute(
            select(Shift)
            .where(Shift.car_wash_id == car_wash_id, Shift.closed_at.is_(None))
            .with_for_update()
        )
    ).scalar_one_or_none()
    if shift is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "shift.not_open"}
        )

    open_orders = (
        await session.execute(
            select(func.count())
            .select_from(Order)
            .where(
                Order.shift_id == shift.id,
                Order.status.in_((OrderStatus.queued, OrderStatus.in_progress)),
            )
        )
    ).scalar_one()
    if open_orders:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail={"code": "shift.has_open_orders"}
        )

    net_cash = await _net_cash_from_payments(session, shift.id)
    movements = await _cash_movement_totals(session, shift.id)
    cash_out = (
        movements.get(CashMovementType.expense.value, 0)
        + movements.get(CashMovementType.payout.value, 0)
        + movements.get(CashMovementType.collection.value, 0)
    )
    cash_in = movements.get(CashMovementType.deposit.value, 0)
    expected = shift.opening_float_minor + net_cash - cash_out + cash_in

    shift.counted_cash_minor = body.counted_cash_minor
    shift.closing_expected_minor = expected
    shift.closed_at = _now()
    shift.closed_by = ctx.user_id
    await session.commit()
    await session.refresh(shift)

    return ShiftCloseOut(
        shift=ShiftOut(
            id=shift.id,
            car_wash_id=shift.car_wash_id,
            opened_by=shift.opened_by,
            closed_by=shift.closed_by,
            opened_at=shift.opened_at,
            closed_at=shift.closed_at,
            opening_float_minor=shift.opening_float_minor,
            counted_cash_minor=shift.counted_cash_minor,
            closing_expected_minor=shift.closing_expected_minor,
        ),
        expected_minor=expected,
        counted_minor=body.counted_cash_minor,
        variance_minor=body.counted_cash_minor - expected,
    )
