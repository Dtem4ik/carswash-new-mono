"""Order lifecycle + money (car-wash-scoped).

Create → price/number/queue/washers; close/cancel → promote the box queue;
payments → derive payment status; list/detail. Every write runs in one
transaction on the active car wash (``X-Car-Wash-Id``); cross-wash rows are
invisible (404). Money is BIGINT minor units, currency snapshotted from the car
wash. Reads are open to any role in scope; writes are capability-gated.
"""

from __future__ import annotations

import datetime
import re
import uuid
from collections.abc import Sequence

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api._common import not_found
from app.auth.capabilities import Capability
from app.auth.guards import active_car_wash, require_capability
from app.auth.tenancy import TenantContext, get_tenant_context
from app.deps import get_session
from app.models.catalog import CarType, PackagePrice, ServicePrice
from app.models.enums import (
    BoxStatus,
    ClientKind,
    DiscountType,
    OrderPaymentStatus,
    OrderStatus,
    PaymentKind,
    PaymentMethod,
)
from app.models.operations import (
    Box,
    Car,
    CarWashOrderCounter,
    Client,
    ClientCar,
    Order,
    OrderService,
    OrderWasher,
    Payment,
    Shift,
)
from app.models.tenancy import Profile

router = APIRouter(tags=["orders"])

_create = require_capability(Capability.ORDERS_CREATE)
_close = require_capability(Capability.ORDERS_CLOSE)
_pay = require_capability(Capability.PAYMENTS_RECORD)


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.UTC)


def _normalize_plate(value: str) -> str:
    return re.sub(r"\s", "", value).upper()


def _bad_request(code: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": code})


def _conflict(code: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": code})


# --- schemas ------------------------------------------------------------------


class OrderServiceIn(BaseModel):
    service_id: uuid.UUID
    qty: int = Field(default=1, ge=1)


class IntakeIn(BaseModel):
    """Registered intake (name/phone present → upsert) or walk-in (plate only)."""

    plate: str | None = None
    client_name: str | None = None
    client_phone: str | None = None
    client_kind: ClientKind = ClientKind.walkin
    brand: str | None = None
    model: str | None = None


class DiscountIn(BaseModel):
    amount_minor: int = Field(ge=0)
    type: DiscountType = DiscountType.manual


class OrderCreate(BaseModel):
    car_type_id: uuid.UUID
    box_id: uuid.UUID
    client_car_id: uuid.UUID | None = None
    intake: IntakeIn | None = None
    services: list[OrderServiceIn] = []
    package_id: uuid.UUID | None = None
    discount: DiscountIn | None = None
    washer_user_ids: list[uuid.UUID] = []


class OrderServiceOut(BaseModel):
    service_id: uuid.UUID
    unit_amount_minor: int
    qty: int


class OrderWasherBrief(BaseModel):
    """A washer assigned to an order, with the display name from ``profiles``."""

    user_id: uuid.UUID
    name: str | None


class OrderWasherOut(OrderWasherBrief):
    share_bps: int
    earned_amount_minor: int


class PaymentOut(BaseModel):
    id: uuid.UUID
    method: PaymentMethod
    kind: PaymentKind
    amount_minor: int
    currency: str
    received_by: uuid.UUID | None
    paid_at: datetime.datetime


class OrderOut(BaseModel):
    id: uuid.UUID
    number: int
    car_wash_id: uuid.UUID
    box_id: uuid.UUID
    shift_id: uuid.UUID
    client_car_id: uuid.UUID | None
    # Resolved vehicle plate: the registered car's plate, else the walk-in snapshot.
    plate: str | None
    car_brand: str | None
    car_model: str | None
    # Client identity when the order is registered; null for an anonymous walk-in.
    client_name: str | None
    client_phone: str | None
    car_type_id: uuid.UUID
    status: OrderStatus
    payment_status: OrderPaymentStatus
    subtotal_minor: int
    discount_amount_minor: int
    discount_type: DiscountType
    total_minor: int
    currency: str
    package_id: uuid.UUID | None
    # Assigned washers with their display names (for the board + list).
    washers: Sequence[OrderWasherBrief]
    created_by: uuid.UUID
    finished_by: uuid.UUID | None
    started_at: datetime.datetime | None
    finished_at: datetime.datetime | None
    created_at: datetime.datetime


class OrderDetailOut(OrderOut):
    services: list[OrderServiceOut]
    # The detail view carries the full washer payroll snapshot (share + earned).
    washers: Sequence[OrderWasherOut]
    payments: list[PaymentOut]
    paid_total_minor: int
    balance_minor: int


class OrderPage(BaseModel):
    items: list[OrderOut]
    total: int
    limit: int
    offset: int


class PaymentCreate(BaseModel):
    method: PaymentMethod
    kind: PaymentKind = PaymentKind.payment
    amount_minor: int = Field(ge=0)


# --- helpers ------------------------------------------------------------------


async def _order_for_update(
    session: AsyncSession, order_id: uuid.UUID, car_wash_id: uuid.UUID
) -> Order:
    obj = (
        await session.execute(
            select(Order)
            .where(Order.id == order_id, Order.car_wash_id == car_wash_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if obj is None:
        raise not_found()
    return obj


async def _order_is_corporate(session: AsyncSession, order: Order) -> bool:
    if order.client_car_id is None:
        return False
    kind = (
        await session.execute(
            select(Client.kind)
            .join(ClientCar, ClientCar.client_id == Client.id)
            .where(ClientCar.id == order.client_car_id)
        )
    ).scalar_one_or_none()
    return kind == ClientKind.corporate


async def _payment_totals(session: AsyncSession, order_id: uuid.UUID) -> tuple[int, int]:
    """(paid_sum, refund_sum) for an order."""
    rows = (
        await session.execute(
            select(Payment.kind, func.coalesce(func.sum(Payment.amount_minor), 0))
            .where(Payment.order_id == order_id)
            .group_by(Payment.kind)
        )
    ).all()
    paid = refund = 0
    for kind, total in rows:
        if kind == PaymentKind.payment:
            paid = int(total)
        else:
            refund = int(total)
    return paid, refund


async def _recompute_payment_status(session: AsyncSession, order: Order) -> None:
    paid, refund = await _payment_totals(session, order.id)
    net = paid - refund
    if refund > 0 and net <= 0:
        order.payment_status = OrderPaymentStatus.refunded
    elif net <= 0:
        order.payment_status = (
            OrderPaymentStatus.credit
            if await _order_is_corporate(session, order)
            else OrderPaymentStatus.unpaid
        )
    elif net < order.total_minor:
        order.payment_status = OrderPaymentStatus.partial
    else:
        order.payment_status = OrderPaymentStatus.paid


async def _allocate_number(session: AsyncSession, car_wash_id: uuid.UUID) -> int:
    """Gap-free per-car-wash number; the FOR UPDATE row lock serializes creates."""
    await session.execute(
        pg_insert(CarWashOrderCounter)
        .values(car_wash_id=car_wash_id, next_number=1)
        .on_conflict_do_nothing(index_elements=["car_wash_id"])
    )
    counter = (
        await session.execute(
            select(CarWashOrderCounter)
            .where(CarWashOrderCounter.car_wash_id == car_wash_id)
            .with_for_update()
        )
    ).scalar_one()
    number = counter.next_number
    counter.next_number = number + 1
    return number


def _washer_shares(user_ids: list[uuid.UUID]) -> list[tuple[uuid.UUID, int]]:
    """Equal basis-point split (10000/N), remainder to the first washer."""
    unique = list(dict.fromkeys(user_ids))
    n = len(unique)
    if n == 0:
        return []
    base = 10000 // n
    remainder = 10000 - base * n
    return [(uid, base + (remainder if i == 0 else 0)) for i, uid in enumerate(unique)]


class _VehicleClient(BaseModel):
    """Resolved vehicle + client identity for a registered order's ``client_car``."""

    plate: str
    brand: str | None
    model: str | None
    client_name: str
    client_phone: str | None


def _to_out(
    order: Order,
    *,
    washers: list[OrderWasherBrief],
    vehicle: _VehicleClient | None,
) -> OrderOut:
    return OrderOut(
        id=order.id,
        number=order.number,
        car_wash_id=order.car_wash_id,
        box_id=order.box_id,
        shift_id=order.shift_id,
        client_car_id=order.client_car_id,
        # Registered orders snapshot no plate; resolve it from the linked car.
        plate=order.plate if order.plate is not None else (vehicle.plate if vehicle else None),
        car_brand=vehicle.brand if vehicle else None,
        car_model=vehicle.model if vehicle else None,
        client_name=vehicle.client_name if vehicle else None,
        client_phone=vehicle.client_phone if vehicle else None,
        car_type_id=order.car_type_id,
        status=order.status,
        payment_status=order.payment_status,
        subtotal_minor=order.subtotal_minor,
        discount_amount_minor=order.discount_amount_minor,
        discount_type=order.discount_type,
        total_minor=order.total_minor,
        currency=order.currency,
        package_id=order.package_id,
        washers=washers,
        created_by=order.created_by,
        finished_by=order.finished_by,
        started_at=order.started_at,
        finished_at=order.finished_at,
        created_at=order.created_at,
    )


async def _washer_names(
    session: AsyncSession, order_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[tuple[uuid.UUID, str | None]]]:
    """Map each order id → its assigned washers as (user_id, display name)."""
    if not order_ids:
        return {}
    rows = (
        await session.execute(
            select(OrderWasher.order_id, OrderWasher.user_id, Profile.full_name)
            .join(Profile, Profile.id == OrderWasher.user_id, isouter=True)
            .where(OrderWasher.order_id.in_(order_ids))
        )
    ).all()
    grouped: dict[uuid.UUID, list[tuple[uuid.UUID, str | None]]] = {}
    for order_id, user_id, full_name in rows:
        grouped.setdefault(order_id, []).append((user_id, full_name))
    return grouped


async def _vehicle_clients(
    session: AsyncSession, client_car_ids: list[uuid.UUID]
) -> dict[uuid.UUID, _VehicleClient]:
    """Map each ``client_car`` id → its resolved vehicle + client identity."""
    if not client_car_ids:
        return {}
    rows = (
        await session.execute(
            select(
                ClientCar.id,
                Car.plate,
                Car.brand,
                Car.model,
                Client.name,
                Client.phone,
            )
            .join(Car, Car.id == ClientCar.car_id)
            .join(Client, Client.id == ClientCar.client_id)
            .where(ClientCar.id.in_(client_car_ids))
        )
    ).all()
    return {
        cc_id: _VehicleClient(
            plate=plate, brand=brand, model=model, client_name=name, client_phone=phone
        )
        for cc_id, plate, brand, model, name, phone in rows
    }


async def _enrich_orders(session: AsyncSession, orders: list[Order]) -> list[OrderOut]:
    """Batch-resolve washers + vehicle/client for a page of orders (no N+1)."""
    washers = await _washer_names(session, [o.id for o in orders])
    vehicles = await _vehicle_clients(
        session, [o.client_car_id for o in orders if o.client_car_id is not None]
    )
    return [
        _to_out(
            o,
            washers=[
                OrderWasherBrief(user_id=uid, name=name) for uid, name in washers.get(o.id, [])
            ],
            vehicle=vehicles.get(o.client_car_id) if o.client_car_id is not None else None,
        )
        for o in orders
    ]


async def _resolve_intake(
    session: AsyncSession,
    organization_id: uuid.UUID,
    car_type_id: uuid.UUID,
    body: OrderCreate,
) -> tuple[uuid.UUID | None, str | None]:
    """Return (client_car_id, plate_snapshot) for registered / new / walk-in intake."""
    # Existing registered link.
    if body.client_car_id is not None:
        link = (
            await session.execute(
                select(ClientCar)
                .join(Client, Client.id == ClientCar.client_id)
                .where(
                    ClientCar.id == body.client_car_id,
                    Client.organization_id == organization_id,
                )
            )
        ).scalar_one_or_none()
        if link is None:
            raise not_found()
        return body.client_car_id, None

    intake = body.intake
    # New registered intake: a named/phoned customer → upsert client + car + link.
    if intake is not None and (intake.client_name or intake.client_phone):
        if not intake.plate:
            raise _bad_request("order.plate_required")
        client = None
        if intake.client_phone:
            client = (
                await session.execute(
                    select(Client).where(
                        Client.organization_id == organization_id,
                        Client.phone == intake.client_phone,
                    )
                )
            ).scalar_one_or_none()
        if client is None:
            client = Client(
                organization_id=organization_id,
                name=intake.client_name or intake.client_phone or "",
                phone=intake.client_phone,
                kind=intake.client_kind,
            )
            session.add(client)
            await session.flush()
        normalized = _normalize_plate(intake.plate)
        plate_norm = func.upper(func.regexp_replace(Car.plate, r"\s", "", "g"))
        car = (
            await session.execute(
                select(Car).where(Car.organization_id == organization_id, plate_norm == normalized)
            )
        ).scalar_one_or_none()
        if car is None:
            car = Car(
                organization_id=organization_id,
                plate=intake.plate,
                car_type_id=car_type_id,
                brand=intake.brand,
                model=intake.model,
            )
            session.add(car)
            await session.flush()
        link = (
            await session.execute(
                select(ClientCar).where(
                    ClientCar.client_id == client.id, ClientCar.car_id == car.id
                )
            )
        ).scalar_one_or_none()
        if link is None:
            link = ClientCar(client_id=client.id, car_id=car.id)
            session.add(link)
            await session.flush()
        return link.id, None

    # Walk-in: an anonymous vehicle, plate snapshot only.
    plate = intake.plate if intake else None
    if not plate:
        raise _bad_request("order.intake_required")
    return None, plate


# --- create -------------------------------------------------------------------


@router.post("/orders", response_model=OrderDetailOut, dependencies=[Depends(_create)])
async def create_order(
    body: OrderCreate,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> OrderDetailOut:
    car_wash_id = active_car_wash(ctx)

    # Car type must belong to the organization.
    car_type = await session.get(CarType, body.car_type_id)
    if car_type is None or car_type.organization_id != ctx.organization.id:
        raise not_found()

    # A current OPEN shift is required.
    shift = (
        await session.execute(
            select(Shift).where(Shift.car_wash_id == car_wash_id, Shift.closed_at.is_(None))
        )
    ).scalar_one_or_none()
    if shift is None:
        raise _bad_request("shift.not_open")

    # The box must belong to this car wash; lock it to serialize assignment.
    box = (
        await session.execute(
            select(Box)
            .where(Box.id == body.box_id, Box.car_wash_id == car_wash_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if box is None:
        raise not_found()

    client_car_id, plate_snapshot = await _resolve_intake(
        session, ctx.organization.id, body.car_type_id, body
    )

    # Pricing: snapshot each unit price; sum the subtotal.
    if not body.services and body.package_id is None:
        raise _bad_request("order.empty")

    subtotal = 0
    order_services: list[OrderService] = []
    if body.services:
        service_ids = [s.service_id for s in body.services]
        price_rows = (
            await session.execute(
                select(ServicePrice).where(
                    ServicePrice.car_wash_id == car_wash_id,
                    ServicePrice.car_type_id == body.car_type_id,
                    ServicePrice.service_id.in_(service_ids),
                )
            )
        ).scalars()
        price_by_service = {r.service_id: r.amount_minor for r in price_rows}
        for item in body.services:
            unit = price_by_service.get(item.service_id)
            if unit is None:
                raise _bad_request("pricing.missing")
            subtotal += unit * item.qty
            order_services.append(
                OrderService(service_id=item.service_id, unit_amount_minor=unit, qty=item.qty)
            )

    if body.package_id is not None:
        package_price = (
            await session.execute(
                select(PackagePrice).where(
                    PackagePrice.car_wash_id == car_wash_id,
                    PackagePrice.package_id == body.package_id,
                    PackagePrice.car_type_id == body.car_type_id,
                )
            )
        ).scalar_one_or_none()
        if package_price is None:
            raise _bad_request("pricing.missing")
        subtotal += package_price.amount_minor

    discount_amount = body.discount.amount_minor if body.discount else 0
    discount_type = body.discount.type if body.discount else DiscountType.none
    if discount_amount > subtotal:
        raise _bad_request("discount.exceeds_subtotal")
    total = subtotal - discount_amount

    # Currency snapshot from the car wash.
    currency = next(cw.currency for cw in ctx.car_washes if cw.id == car_wash_id)

    number = await _allocate_number(session, car_wash_id)

    # Free box → start immediately; occupied box → queue.
    box_free = box.status == BoxStatus.free and box.active_order_id is None
    now = _now()
    order = Order(
        car_wash_id=car_wash_id,
        box_id=box.id,
        shift_id=shift.id,
        client_car_id=client_car_id,
        plate=plate_snapshot,
        car_type_id=body.car_type_id,
        number=number,
        status=OrderStatus.in_progress if box_free else OrderStatus.queued,
        subtotal_minor=subtotal,
        discount_amount_minor=discount_amount,
        discount_type=discount_type,
        total_minor=total,
        currency=currency,
        payment_status=OrderPaymentStatus.unpaid,
        authorized_by=ctx.user_id if discount_amount > 0 else None,
        package_id=body.package_id,
        created_by=ctx.user_id,
        started_at=now if box_free else None,
    )
    session.add(order)
    await session.flush()

    for line in order_services:
        line.order_id = order.id
        session.add(line)

    for user_id, share_bps in _washer_shares(body.washer_user_ids):
        session.add(
            OrderWasher(
                order_id=order.id, user_id=user_id, share_bps=share_bps, earned_amount_minor=0
            )
        )

    if box_free:
        box.active_order_id = order.id
        box.status = BoxStatus.busy

    # Corporate customers wash on credit from day one.
    if await _order_is_corporate(session, order):
        order.payment_status = OrderPaymentStatus.credit

    await session.commit()
    return await _build_detail(session, order.id, car_wash_id)


# --- close / cancel -----------------------------------------------------------


async def _promote_box_queue(session: AsyncSession, box: Box, now: datetime.datetime) -> None:
    """Start the oldest queued order on ``box``, or free the box if none."""
    nxt = (
        await session.execute(
            select(Order)
            .where(
                Order.box_id == box.id,
                Order.car_wash_id == box.car_wash_id,
                Order.status == OrderStatus.queued,
            )
            .order_by(Order.number)
            .limit(1)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if nxt is not None:
        nxt.status = OrderStatus.in_progress
        nxt.started_at = now
        box.active_order_id = nxt.id
        box.status = BoxStatus.busy
    else:
        box.active_order_id = None
        box.status = BoxStatus.free


@router.post(
    "/orders/{order_id}/close", response_model=OrderDetailOut, dependencies=[Depends(_close)]
)
async def close_order(
    order_id: uuid.UUID,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> OrderDetailOut:
    car_wash_id = active_car_wash(ctx)
    order = await _order_for_update(session, order_id, car_wash_id)
    if order.status != OrderStatus.in_progress:
        raise _conflict("order.not_in_progress")

    now = _now()
    order.status = OrderStatus.done
    order.finished_by = ctx.user_id
    order.finished_at = now

    box = (
        await session.execute(select(Box).where(Box.id == order.box_id).with_for_update())
    ).scalar_one()
    if box.active_order_id == order.id:
        await _promote_box_queue(session, box, now)

    await session.commit()
    return await _build_detail(session, order.id, car_wash_id)


@router.post(
    "/orders/{order_id}/cancel", response_model=OrderDetailOut, dependencies=[Depends(_close)]
)
async def cancel_order(
    order_id: uuid.UUID,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> OrderDetailOut:
    car_wash_id = active_car_wash(ctx)
    order = await _order_for_update(session, order_id, car_wash_id)
    if order.status in (OrderStatus.done, OrderStatus.cancelled):
        raise _conflict("order.not_cancellable")

    now = _now()
    was_in_progress = order.status == OrderStatus.in_progress
    order.status = OrderStatus.cancelled

    if was_in_progress:
        box = (
            await session.execute(select(Box).where(Box.id == order.box_id).with_for_update())
        ).scalar_one()
        if box.active_order_id == order.id:
            await _promote_box_queue(session, box, now)

    await session.commit()
    return await _build_detail(session, order.id, car_wash_id)


# --- payments -----------------------------------------------------------------


@router.post("/orders/{order_id}/payments", response_model=PaymentOut, dependencies=[Depends(_pay)])
async def record_payment(
    order_id: uuid.UUID,
    body: PaymentCreate,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> Payment:
    car_wash_id = active_car_wash(ctx)
    order = await _order_for_update(session, order_id, car_wash_id)

    payment = Payment(
        order_id=order.id,
        car_wash_id=car_wash_id,
        method=body.method,
        kind=body.kind,
        amount_minor=body.amount_minor,
        currency=order.currency,
        received_by=ctx.user_id,
        paid_at=_now(),
    )
    session.add(payment)
    await session.flush()
    await _recompute_payment_status(session, order)
    await session.commit()
    await session.refresh(payment)
    return payment


@router.get("/orders/{order_id}/payments", response_model=list[PaymentOut])
async def list_payments(
    order_id: uuid.UUID,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> list[Payment]:
    car_wash_id = active_car_wash(ctx)
    order = await session.get(Order, order_id)
    if order is None or order.car_wash_id != car_wash_id:
        raise not_found()
    return list(
        (
            await session.execute(
                select(Payment).where(Payment.order_id == order_id).order_by(Payment.paid_at)
            )
        ).scalars()
    )


# --- listing & detail ---------------------------------------------------------


@router.get("/orders", response_model=OrderPage)
async def list_orders(
    status_filter: OrderStatus | None = Query(default=None, alias="status"),
    box_id: uuid.UUID | None = None,
    created_from: datetime.datetime | None = None,
    created_to: datetime.datetime | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> OrderPage:
    car_wash_id = active_car_wash(ctx)
    conditions = [Order.car_wash_id == car_wash_id]
    if status_filter is not None:
        conditions.append(Order.status == status_filter)
    if box_id is not None:
        conditions.append(Order.box_id == box_id)
    if created_from is not None:
        conditions.append(Order.created_at >= created_from)
    if created_to is not None:
        conditions.append(Order.created_at < created_to)

    total = (
        await session.execute(select(func.count()).select_from(Order).where(*conditions))
    ).scalar_one()
    rows = list(
        (
            await session.execute(
                select(Order)
                .where(*conditions)
                .order_by(Order.number.desc())
                .limit(limit)
                .offset(offset)
            )
        ).scalars()
    )
    items = await _enrich_orders(session, rows)
    return OrderPage(items=items, total=int(total), limit=limit, offset=offset)


async def _build_detail(
    session: AsyncSession, order_id: uuid.UUID, car_wash_id: uuid.UUID
) -> OrderDetailOut:
    order = await session.get(Order, order_id)
    if order is None or order.car_wash_id != car_wash_id:
        raise not_found()
    services = list(
        (
            await session.execute(select(OrderService).where(OrderService.order_id == order_id))
        ).scalars()
    )
    washers = list(
        (
            await session.execute(select(OrderWasher).where(OrderWasher.order_id == order_id))
        ).scalars()
    )
    washer_names = {
        uid: name for uid, name in (await _washer_names(session, [order_id])).get(order_id, [])
    }
    payments = list(
        (
            await session.execute(
                select(Payment).where(Payment.order_id == order_id).order_by(Payment.paid_at)
            )
        ).scalars()
    )
    paid, refund = await _payment_totals(session, order_id)
    paid_total = paid - refund

    vehicle = (
        (await _vehicle_clients(session, [order.client_car_id])).get(order.client_car_id)
        if order.client_car_id is not None
        else None
    )
    base = _to_out(
        order,
        washers=[OrderWasherBrief(user_id=uid, name=name) for uid, name in washer_names.items()],
        vehicle=vehicle,
    )
    return OrderDetailOut(
        **base.model_dump(exclude={"washers"}),
        services=[
            OrderServiceOut(
                service_id=s.service_id, unit_amount_minor=s.unit_amount_minor, qty=s.qty
            )
            for s in services
        ],
        washers=[
            OrderWasherOut(
                user_id=w.user_id,
                name=washer_names.get(w.user_id),
                share_bps=w.share_bps,
                earned_amount_minor=w.earned_amount_minor,
            )
            for w in washers
        ],
        payments=[
            PaymentOut(
                id=p.id,
                method=p.method,
                kind=p.kind,
                amount_minor=p.amount_minor,
                currency=p.currency,
                received_by=p.received_by,
                paid_at=p.paid_at,
            )
            for p in payments
        ],
        paid_total_minor=paid_total,
        balance_minor=order.total_minor - paid_total,
    )


@router.get("/orders/{order_id}", response_model=OrderDetailOut)
async def get_order(
    order_id: uuid.UUID,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> OrderDetailOut:
    return await _build_detail(session, order_id, active_car_wash(ctx))
