"""Client & car lookup (organization-scoped, read-only).

Supports order intake in Phase 3b: find a client by name/phone, find a car by its
normalized plate (the dedup key: uppercased, whitespace removed), and list a
client's cars. Writes (upsert-on-order) are Phase 3b. All results are filtered by
the caller's organization.
"""

from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api._common import not_found
from app.auth.guards import active_car_wash
from app.auth.tenancy import TenantContext, get_tenant_context
from app.deps import get_session
from app.models.enums import ClientKind, MembershipRole
from app.models.operations import Car, Client, ClientCar
from app.models.tenancy import Membership, Profile

router = APIRouter(tags=["lookup"])

_LIMIT = 20


class ClientOut(BaseModel):
    id: uuid.UUID
    name: str
    phone: str | None
    kind: ClientKind


class CarOut(BaseModel):
    id: uuid.UUID
    plate: str
    car_type_id: uuid.UUID
    brand: str | None
    model: str | None


class StaffOut(BaseModel):
    """A user assignable as a washer at the active car wash."""

    user_id: uuid.UUID
    name: str | None
    role: MembershipRole


def _normalize_plate(value: str) -> str:
    return re.sub(r"\s", "", value).upper()


@router.get("/clients", response_model=list[ClientOut])
async def search_clients(
    q: str = Query(min_length=1),
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> list[Client]:
    pattern = f"%{q.strip()}%"
    stmt = (
        select(Client)
        .where(
            Client.organization_id == ctx.organization.id,
            Client.name.ilike(pattern) | Client.phone.ilike(pattern),
        )
        .order_by(Client.name)
        .limit(_LIMIT)
    )
    return list((await session.execute(stmt)).scalars())


@router.get("/cars", response_model=list[CarOut])
async def search_cars(
    plate: str = Query(min_length=1),
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> list[Car]:
    normalized = _normalize_plate(plate)
    plate_norm = func.upper(func.regexp_replace(Car.plate, r"\s", "", "g"))
    stmt = (
        select(Car)
        .where(
            Car.organization_id == ctx.organization.id,
            plate_norm.like(f"%{normalized}%"),
        )
        .order_by(Car.plate)
        .limit(_LIMIT)
    )
    return list((await session.execute(stmt)).scalars())


@router.get("/staff", response_model=list[StaffOut])
async def list_staff(
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> list[StaffOut]:
    """Users assignable as washers at the active car wash: members scoped to this
    car wash plus org-level members (owner/org_admin who can also work the floor).
    """
    car_wash_id = active_car_wash(ctx)
    stmt = (
        select(Membership.user_id, Profile.full_name, Membership.role)
        .join(Profile, Profile.id == Membership.user_id, isouter=True)
        .where(
            Membership.organization_id == ctx.organization.id,
            (Membership.car_wash_id == car_wash_id) | (Membership.car_wash_id.is_(None)),
        )
        .order_by(Profile.full_name)
    )
    rows = (await session.execute(stmt)).all()
    return [StaffOut(user_id=uid, name=name, role=role) for uid, name, role in rows]


@router.get("/clients/{client_id}/cars", response_model=list[CarOut])
async def list_client_cars(
    client_id: uuid.UUID,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> list[Car]:
    client = await session.get(Client, client_id)
    if client is None or client.organization_id != ctx.organization.id:
        raise not_found()
    stmt = (
        select(Car)
        .join(ClientCar, ClientCar.car_id == Car.id)
        .where(ClientCar.client_id == client_id)
        .order_by(Car.plate)
    )
    return list((await session.execute(stmt)).scalars())
