"""Pricing endpoints: the per-car-wash price matrix (service/package × car type).

Prices belong to the active car wash (``X-Car-Wash-Id``). Reads are open to any
role in scope; upserts require ``pricing.edit``. The referenced service/package
and car type must belong to the caller's organization. Amounts are minor units
and constrained ``>= 0``.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api._common import not_found
from app.auth.capabilities import Capability
from app.auth.guards import active_car_wash, require_capability
from app.auth.tenancy import TenantContext, get_tenant_context
from app.deps import get_session
from app.models.catalog import CarType, Package, PackagePrice, Service, ServicePrice

router = APIRouter(tags=["pricing"])

_edit = require_capability(Capability.PRICING_EDIT)


class ServicePriceUpsert(BaseModel):
    service_id: uuid.UUID
    car_type_id: uuid.UUID
    amount_minor: int = Field(ge=0)


class ServicePriceOut(BaseModel):
    id: uuid.UUID
    car_wash_id: uuid.UUID
    service_id: uuid.UUID
    car_type_id: uuid.UUID
    amount_minor: int


class PackagePriceUpsert(BaseModel):
    package_id: uuid.UUID
    car_type_id: uuid.UUID
    amount_minor: int = Field(ge=0)


class PackagePriceOut(BaseModel):
    id: uuid.UUID
    car_wash_id: uuid.UUID
    package_id: uuid.UUID
    car_type_id: uuid.UUID
    amount_minor: int


async def _belongs_to_org[T: (CarType, Service, Package)](
    session: AsyncSession, model: type[T], id_: uuid.UUID, organization_id: uuid.UUID
) -> None:
    obj = await session.get(model, id_)
    if obj is None or obj.organization_id != organization_id:
        raise not_found()


@router.get("/service-prices", response_model=list[ServicePriceOut])
async def list_service_prices(
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> list[ServicePrice]:
    car_wash_id = active_car_wash(ctx)
    stmt = select(ServicePrice).where(ServicePrice.car_wash_id == car_wash_id)
    return list((await session.execute(stmt)).scalars())


@router.put("/service-prices", response_model=ServicePriceOut, dependencies=[Depends(_edit)])
async def upsert_service_price(
    body: ServicePriceUpsert,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> ServicePrice:
    car_wash_id = active_car_wash(ctx)
    await _belongs_to_org(session, Service, body.service_id, ctx.organization.id)
    await _belongs_to_org(session, CarType, body.car_type_id, ctx.organization.id)

    stmt = pg_insert(ServicePrice).values(
        car_wash_id=car_wash_id,
        service_id=body.service_id,
        car_type_id=body.car_type_id,
        amount_minor=body.amount_minor,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["car_wash_id", "service_id", "car_type_id"],
        set_={"amount_minor": body.amount_minor},
    )
    await session.execute(stmt)
    await session.commit()

    return (
        await session.execute(
            select(ServicePrice).where(
                ServicePrice.car_wash_id == car_wash_id,
                ServicePrice.service_id == body.service_id,
                ServicePrice.car_type_id == body.car_type_id,
            )
        )
    ).scalar_one()


@router.get("/package-prices", response_model=list[PackagePriceOut])
async def list_package_prices(
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> list[PackagePrice]:
    car_wash_id = active_car_wash(ctx)
    stmt = select(PackagePrice).where(PackagePrice.car_wash_id == car_wash_id)
    return list((await session.execute(stmt)).scalars())


@router.put("/package-prices", response_model=PackagePriceOut, dependencies=[Depends(_edit)])
async def upsert_package_price(
    body: PackagePriceUpsert,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> PackagePrice:
    car_wash_id = active_car_wash(ctx)
    await _belongs_to_org(session, Package, body.package_id, ctx.organization.id)
    await _belongs_to_org(session, CarType, body.car_type_id, ctx.organization.id)

    stmt = pg_insert(PackagePrice).values(
        car_wash_id=car_wash_id,
        package_id=body.package_id,
        car_type_id=body.car_type_id,
        amount_minor=body.amount_minor,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["car_wash_id", "package_id", "car_type_id"],
        set_={"amount_minor": body.amount_minor},
    )
    await session.execute(stmt)
    await session.commit()

    return (
        await session.execute(
            select(PackagePrice).where(
                PackagePrice.car_wash_id == car_wash_id,
                PackagePrice.package_id == body.package_id,
                PackagePrice.car_type_id == body.car_type_id,
            )
        )
    ).scalar_one()
