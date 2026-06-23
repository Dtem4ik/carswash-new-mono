"""Catalog endpoints: car types, services, packages (organization-scoped).

Reads are open to any role in the org; mutations require ``catalog.manage``.
Every query is filtered by the caller's ``organization_id`` so cross-tenant rows
are invisible (mutations on a foreign id 404 rather than leak existence).
Archiving flips ``is_active`` — rows are never deleted.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api._common import not_found
from app.auth.capabilities import Capability
from app.auth.guards import require_capability
from app.auth.tenancy import TenantContext, get_tenant_context
from app.deps import get_session
from app.models.catalog import CarType, Package, PackageService, Service

router = APIRouter(tags=["catalog"])

_manage = require_capability(Capability.CATALOG_MANAGE)


# --- car types ----------------------------------------------------------------


class CarTypeCreate(BaseModel):
    name: str = Field(min_length=1)
    sort: int = 0


class CarTypeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    sort: int | None = None


class CarTypeOut(BaseModel):
    id: uuid.UUID
    name: str
    sort: int
    is_active: bool


@router.get("/car-types", response_model=list[CarTypeOut])
async def list_car_types(
    include_inactive: bool = False,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> list[CarType]:
    stmt = select(CarType).where(CarType.organization_id == ctx.organization.id)
    if not include_inactive:
        stmt = stmt.where(CarType.is_active.is_(True))
    stmt = stmt.order_by(CarType.sort, CarType.name)
    return list((await session.execute(stmt)).scalars())


@router.post("/car-types", response_model=CarTypeOut, dependencies=[Depends(_manage)])
async def create_car_type(
    body: CarTypeCreate,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> CarType:
    obj = CarType(organization_id=ctx.organization.id, name=body.name, sort=body.sort)
    session.add(obj)
    await session.commit()
    await session.refresh(obj)
    return obj


@router.patch(
    "/car-types/{car_type_id}", response_model=CarTypeOut, dependencies=[Depends(_manage)]
)
async def update_car_type(
    car_type_id: uuid.UUID,
    body: CarTypeUpdate,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> CarType:
    obj = await session.get(CarType, car_type_id)
    if obj is None or obj.organization_id != ctx.organization.id:
        raise not_found()
    if body.name is not None:
        obj.name = body.name
    if body.sort is not None:
        obj.sort = body.sort
    await session.commit()
    await session.refresh(obj)
    return obj


@router.post(
    "/car-types/{car_type_id}/archive", response_model=CarTypeOut, dependencies=[Depends(_manage)]
)
async def archive_car_type(
    car_type_id: uuid.UUID,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> CarType:
    obj = await session.get(CarType, car_type_id)
    if obj is None or obj.organization_id != ctx.organization.id:
        raise not_found()
    obj.is_active = False
    await session.commit()
    await session.refresh(obj)
    return obj


@router.post(
    "/car-types/{car_type_id}/restore", response_model=CarTypeOut, dependencies=[Depends(_manage)]
)
async def restore_car_type(
    car_type_id: uuid.UUID,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> CarType:
    obj = await session.get(CarType, car_type_id)
    if obj is None or obj.organization_id != ctx.organization.id:
        raise not_found()
    obj.is_active = True
    await session.commit()
    await session.refresh(obj)
    return obj


# --- services -----------------------------------------------------------------


class ServiceCreate(BaseModel):
    name: str = Field(min_length=1)


class ServiceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)


class ServiceOut(BaseModel):
    id: uuid.UUID
    name: str
    is_active: bool


@router.get("/services", response_model=list[ServiceOut])
async def list_services(
    include_inactive: bool = False,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> list[Service]:
    stmt = select(Service).where(Service.organization_id == ctx.organization.id)
    if not include_inactive:
        stmt = stmt.where(Service.is_active.is_(True))
    stmt = stmt.order_by(Service.name)
    return list((await session.execute(stmt)).scalars())


@router.post("/services", response_model=ServiceOut, dependencies=[Depends(_manage)])
async def create_service(
    body: ServiceCreate,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> Service:
    obj = Service(organization_id=ctx.organization.id, name=body.name)
    session.add(obj)
    await session.commit()
    await session.refresh(obj)
    return obj


@router.patch("/services/{service_id}", response_model=ServiceOut, dependencies=[Depends(_manage)])
async def update_service(
    service_id: uuid.UUID,
    body: ServiceUpdate,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> Service:
    obj = await session.get(Service, service_id)
    if obj is None or obj.organization_id != ctx.organization.id:
        raise not_found()
    if body.name is not None:
        obj.name = body.name
    await session.commit()
    await session.refresh(obj)
    return obj


@router.post(
    "/services/{service_id}/archive", response_model=ServiceOut, dependencies=[Depends(_manage)]
)
async def archive_service(
    service_id: uuid.UUID,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> Service:
    obj = await session.get(Service, service_id)
    if obj is None or obj.organization_id != ctx.organization.id:
        raise not_found()
    obj.is_active = False
    await session.commit()
    await session.refresh(obj)
    return obj


@router.post(
    "/services/{service_id}/restore", response_model=ServiceOut, dependencies=[Depends(_manage)]
)
async def restore_service(
    service_id: uuid.UUID,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> Service:
    obj = await session.get(Service, service_id)
    if obj is None or obj.organization_id != ctx.organization.id:
        raise not_found()
    obj.is_active = True
    await session.commit()
    await session.refresh(obj)
    return obj


# --- packages -----------------------------------------------------------------


class PackageCreate(BaseModel):
    name: str = Field(min_length=1)


class PackageUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)


class PackageServicesUpdate(BaseModel):
    service_ids: list[uuid.UUID]


class PackageOut(BaseModel):
    id: uuid.UUID
    name: str
    is_active: bool
    service_ids: list[uuid.UUID]


async def _service_ids_by_package(
    session: AsyncSession, package_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[uuid.UUID]]:
    if not package_ids:
        return {}
    rows = (
        await session.execute(
            select(PackageService.package_id, PackageService.service_id).where(
                PackageService.package_id.in_(package_ids)
            )
        )
    ).all()
    grouped: dict[uuid.UUID, list[uuid.UUID]] = {pid: [] for pid in package_ids}
    for package_id, service_id in rows:
        grouped[package_id].append(service_id)
    return grouped


async def _package_or_404(
    session: AsyncSession, package_id: uuid.UUID, organization_id: uuid.UUID
) -> Package:
    obj = await session.get(Package, package_id)
    if obj is None or obj.organization_id != organization_id:
        raise not_found()
    return obj


@router.get("/packages", response_model=list[PackageOut])
async def list_packages(
    include_inactive: bool = False,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> list[PackageOut]:
    stmt = select(Package).where(Package.organization_id == ctx.organization.id)
    if not include_inactive:
        stmt = stmt.where(Package.is_active.is_(True))
    stmt = stmt.order_by(Package.name)
    packages = list((await session.execute(stmt)).scalars())
    grouped = await _service_ids_by_package(session, [p.id for p in packages])
    return [
        PackageOut(id=p.id, name=p.name, is_active=p.is_active, service_ids=grouped.get(p.id, []))
        for p in packages
    ]


@router.post("/packages", response_model=PackageOut, dependencies=[Depends(_manage)])
async def create_package(
    body: PackageCreate,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> PackageOut:
    obj = Package(organization_id=ctx.organization.id, name=body.name)
    session.add(obj)
    await session.commit()
    await session.refresh(obj)
    return PackageOut(id=obj.id, name=obj.name, is_active=obj.is_active, service_ids=[])


@router.patch("/packages/{package_id}", response_model=PackageOut, dependencies=[Depends(_manage)])
async def update_package(
    package_id: uuid.UUID,
    body: PackageUpdate,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> PackageOut:
    obj = await _package_or_404(session, package_id, ctx.organization.id)
    if body.name is not None:
        obj.name = body.name
    await session.commit()
    await session.refresh(obj)
    grouped = await _service_ids_by_package(session, [obj.id])
    return PackageOut(
        id=obj.id, name=obj.name, is_active=obj.is_active, service_ids=grouped.get(obj.id, [])
    )


@router.post(
    "/packages/{package_id}/archive", response_model=PackageOut, dependencies=[Depends(_manage)]
)
async def archive_package(
    package_id: uuid.UUID,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> PackageOut:
    obj = await _package_or_404(session, package_id, ctx.organization.id)
    obj.is_active = False
    await session.commit()
    await session.refresh(obj)
    grouped = await _service_ids_by_package(session, [obj.id])
    return PackageOut(
        id=obj.id, name=obj.name, is_active=obj.is_active, service_ids=grouped.get(obj.id, [])
    )


@router.post(
    "/packages/{package_id}/restore", response_model=PackageOut, dependencies=[Depends(_manage)]
)
async def restore_package(
    package_id: uuid.UUID,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> PackageOut:
    obj = await _package_or_404(session, package_id, ctx.organization.id)
    obj.is_active = True
    await session.commit()
    await session.refresh(obj)
    grouped = await _service_ids_by_package(session, [obj.id])
    return PackageOut(
        id=obj.id, name=obj.name, is_active=obj.is_active, service_ids=grouped.get(obj.id, [])
    )


@router.put(
    "/packages/{package_id}/services",
    response_model=PackageOut,
    dependencies=[Depends(_manage)],
)
async def set_package_services(
    package_id: uuid.UUID,
    body: PackageServicesUpdate,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> PackageOut:
    pkg = await _package_or_404(session, package_id, ctx.organization.id)

    requested = list(dict.fromkeys(body.service_ids))  # de-dup, preserve order
    if requested:
        valid = set(
            (
                await session.execute(
                    select(Service.id).where(
                        Service.id.in_(requested),
                        Service.organization_id == ctx.organization.id,
                    )
                )
            ).scalars()
        )
        unknown = [sid for sid in requested if sid not in valid]
        if unknown:
            raise not_found()

    existing = list(
        (
            await session.execute(select(PackageService).where(PackageService.package_id == pkg.id))
        ).scalars()
    )
    for link in existing:
        await session.delete(link)
    for service_id in requested:
        session.add(PackageService(package_id=pkg.id, service_id=service_id))
    await session.commit()

    return PackageOut(id=pkg.id, name=pkg.name, is_active=pkg.is_active, service_ids=requested)
