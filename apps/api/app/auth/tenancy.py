"""TenantContext: the per-request tenant scope (ARCHITECTURE.md §3).

Built from the verified user's ``memberships``: an org-level membership
(``car_wash_id IS NULL``, owner/org_admin) grants access to every car wash in the
organization; location memberships grant the single car wash. The active car wash
comes from an optional ``X-Car-Wash-Id`` header, validated against the accessible
set. Every operational query in later phases requires this context.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.capabilities import capabilities_for
from app.auth.jwt import AuthenticatedUser, get_current_user
from app.deps import get_session
from app.models.enums import MembershipRole
from app.models.tenancy import CarWash as CarWashModel
from app.models.tenancy import Membership, Organization, Profile


@dataclass(frozen=True)
class CarWashRef:
    id: uuid.UUID
    name: str
    currency: str
    timezone: str


@dataclass(frozen=True)
class OrganizationRef:
    id: uuid.UUID
    name: str
    default_currency: str
    default_locale: str


@dataclass(frozen=True)
class ProfileRef:
    id: uuid.UUID
    full_name: str | None
    locale: str | None


@dataclass(frozen=True)
class TenantContext:
    user_id: uuid.UUID
    organization: OrganizationRef
    profile: ProfileRef
    role: MembershipRole
    car_washes: tuple[CarWashRef, ...]
    active_car_wash_id: uuid.UUID | None

    @property
    def accessible_car_wash_ids(self) -> tuple[uuid.UUID, ...]:
        return tuple(cw.id for cw in self.car_washes)

    @property
    def capabilities(self) -> frozenset[str]:
        return capabilities_for(self.role)


class TenantError(HTTPException):
    """403/400 with a stable ``{"code": ...}`` body."""

    def __init__(self, status_code: int, code: str) -> None:
        super().__init__(status_code=status_code, detail={"code": code})


def _resolve_location_role(
    memberships: list[Membership], active_car_wash_id: uuid.UUID | None
) -> MembershipRole:
    location = [m for m in memberships if m.car_wash_id is not None]
    if active_car_wash_id is not None:
        for m in location:
            if m.car_wash_id == active_car_wash_id:
                return m.role
    roles = {m.role for m in location}
    if len(roles) == 1:
        return next(iter(roles))
    return location[0].role


async def build_tenant_context(
    session: AsyncSession,
    user: AuthenticatedUser,
    active_car_wash_header: str | None,
) -> TenantContext:
    memberships = list(
        (await session.execute(select(Membership).where(Membership.user_id == user.id))).scalars()
    )
    if not memberships:
        raise TenantError(status.HTTP_403_FORBIDDEN, "tenant.no_membership")

    organization_id = memberships[0].organization_id
    org = await session.get(Organization, organization_id)
    if org is None:
        raise TenantError(status.HTTP_403_FORBIDDEN, "tenant.no_membership")

    org_level = [m for m in memberships if m.car_wash_id is None]
    if org_level:
        role = org_level[0].role
        rows = (
            await session.execute(
                select(CarWashModel)
                .where(
                    CarWashModel.organization_id == organization_id,
                    CarWashModel.is_active.is_(True),
                )
                .order_by(CarWashModel.name)
            )
        ).scalars()
    else:
        location_ids = [m.car_wash_id for m in memberships if m.car_wash_id is not None]
        rows = (
            await session.execute(
                select(CarWashModel)
                .where(CarWashModel.id.in_(location_ids))
                .order_by(CarWashModel.name)
            )
        ).scalars()
        role = MembershipRole.washer  # placeholder; resolved after active is known

    car_washes = tuple(
        CarWashRef(id=cw.id, name=cw.name, currency=cw.currency, timezone=cw.timezone)
        for cw in rows
    )
    accessible_ids = {cw.id for cw in car_washes}

    active_car_wash_id: uuid.UUID | None = None
    if active_car_wash_header:
        try:
            requested = uuid.UUID(active_car_wash_header)
        except ValueError as exc:
            raise TenantError(status.HTTP_400_BAD_REQUEST, "tenant.invalid_car_wash") from exc
        if requested not in accessible_ids:
            raise TenantError(status.HTTP_403_FORBIDDEN, "tenant.car_wash_forbidden")
        active_car_wash_id = requested
    elif len(car_washes) == 1:
        active_car_wash_id = car_washes[0].id

    if not org_level:
        role = _resolve_location_role(memberships, active_car_wash_id)

    profile = await session.get(Profile, user.id)
    profile_ref = ProfileRef(
        id=user.id,
        full_name=profile.full_name if profile else None,
        locale=profile.locale if profile else None,
    )

    return TenantContext(
        user_id=user.id,
        organization=OrganizationRef(
            id=org.id,
            name=org.name,
            default_currency=org.default_currency,
            default_locale=org.default_locale,
        ),
        profile=profile_ref,
        role=role,
        car_washes=car_washes,
        active_car_wash_id=active_car_wash_id,
    )


async def get_tenant_context(
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    x_car_wash_id: str | None = Header(default=None, alias="X-Car-Wash-Id"),
) -> TenantContext:
    """FastAPI dependency injecting the resolved tenant scope for the request."""
    return await build_tenant_context(session, user, x_car_wash_id)
