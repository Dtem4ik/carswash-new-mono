"""Staff & roles management (ARCHITECTURE.md §3, §4).

Endpoints gated by the ``users.manage`` capability. Owner / org_admin manage the
whole organization; a manager may manage only **washers** at their **active car
wash** — enforced here, not by the capability alone. Memberships are always
scoped to the caller's organization. Inviting a new member provisions a
confirmed Supabase auth user with a one-time temporary password (returned once,
never stored); an existing email is attached as a new membership instead.
"""

from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.capabilities import Capability
from app.auth.guards import active_car_wash, require_capability
from app.auth.tenancy import TenantContext, get_tenant_context
from app.deps import get_session
from app.models.enums import MembershipRole
from app.models.tenancy import CarWash, Membership, Profile
from app.services import supabase_admin

router = APIRouter(tags=["members"])

_manage = Depends(require_capability(Capability.USERS_MANAGE))

_ORG_LEVEL_ROLES = {MembershipRole.owner, MembershipRole.org_admin}
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# --- schemas ------------------------------------------------------------------


class MemberOut(BaseModel):
    membership_id: uuid.UUID
    user_id: uuid.UUID
    full_name: str | None
    email: str | None
    role: MembershipRole
    # NULL for an org-level membership (owner / org_admin).
    car_wash_id: uuid.UUID | None
    car_wash_name: str | None


class MemberInvite(BaseModel):
    email: str
    role: MembershipRole
    car_wash_id: uuid.UUID | None = None


class MemberInviteOut(BaseModel):
    member: MemberOut
    # Set only when a new auth user was created; null when an existing email was
    # attached. Shown to the inviter once and never persisted.
    temporary_password: str | None


class MemberRoleUpdate(BaseModel):
    role: MembershipRole
    car_wash_id: uuid.UUID | None = None


# --- helpers ------------------------------------------------------------------


def _error(status_code: int, code: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code})


async def _emails_for(session: AsyncSession, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    """Map auth user ids to their email (the email lives in ``auth.users``)."""
    if not user_ids:
        return {}
    rows = (
        await session.execute(
            text("SELECT id, email FROM auth.users WHERE id = ANY(:ids)").bindparams(ids=user_ids)
        )
    ).all()
    return {row[0]: row[1] for row in rows}


def _normalize_scope(role: MembershipRole, car_wash_id: uuid.UUID | None) -> uuid.UUID | None:
    """Org-level roles are never car-wash-scoped; location roles require one."""
    if role in _ORG_LEVEL_ROLES:
        return None
    if car_wash_id is None:
        raise _error(status.HTTP_400_BAD_REQUEST, "members.car_wash_required")
    return car_wash_id


def _authorize_assignment(
    ctx: TenantContext, role: MembershipRole, car_wash_id: uuid.UUID | None
) -> None:
    """Whether the caller may create/assign this (role, scope) in their org."""
    if ctx.role is MembershipRole.manager:
        if role is not MembershipRole.washer:
            raise _error(status.HTTP_403_FORBIDDEN, "members.forbidden_role")
        if car_wash_id != active_car_wash(ctx):
            raise _error(status.HTTP_403_FORBIDDEN, "members.forbidden_scope")
        return
    # owner / org_admin: any role; a location role must target a car wash in the org.
    if car_wash_id is not None and car_wash_id not in ctx.accessible_car_wash_ids:
        raise _error(status.HTTP_403_FORBIDDEN, "members.forbidden_scope")


def _authorize_target(ctx: TenantContext, membership: Membership) -> None:
    """Whether the caller may modify/remove an existing membership."""
    if ctx.role is MembershipRole.manager and (
        membership.role is not MembershipRole.washer
        or membership.car_wash_id != active_car_wash(ctx)
    ):
        raise _error(status.HTTP_403_FORBIDDEN, "members.forbidden_scope")


async def _member_out(
    session: AsyncSession,
    membership: Membership,
    *,
    email: str | None,
    car_wash_names: dict[uuid.UUID, str],
) -> MemberOut:
    profile = await session.get(Profile, membership.user_id)
    return MemberOut(
        membership_id=membership.id,
        user_id=membership.user_id,
        full_name=profile.full_name if profile else None,
        email=email,
        role=membership.role,
        car_wash_id=membership.car_wash_id,
        car_wash_name=(
            car_wash_names.get(membership.car_wash_id)
            if membership.car_wash_id is not None
            else None
        ),
    )


async def _car_wash_names(
    session: AsyncSession, organization_id: uuid.UUID
) -> dict[uuid.UUID, str]:
    rows = (
        await session.execute(
            select(CarWash.id, CarWash.name).where(CarWash.organization_id == organization_id)
        )
    ).all()
    return {row[0]: row[1] for row in rows}


# --- endpoints ----------------------------------------------------------------


@router.get("/members", response_model=list[MemberOut], dependencies=[_manage])
async def list_members(
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> list[MemberOut]:
    stmt = select(Membership).where(Membership.organization_id == ctx.organization.id)
    # A manager only sees staff at their active car wash; owner/org_admin see all.
    if ctx.role is MembershipRole.manager:
        stmt = stmt.where(Membership.car_wash_id == active_car_wash(ctx))
    memberships = list((await session.execute(stmt)).scalars())

    emails = await _emails_for(session, [m.user_id for m in memberships])
    names = await _car_wash_names(session, ctx.organization.id)
    out = [
        await _member_out(session, m, email=emails.get(m.user_id), car_wash_names=names)
        for m in memberships
    ]
    out.sort(key=lambda m: (m.role.value, (m.full_name or m.email or "").lower()))
    return out


@router.post(
    "/members",
    response_model=MemberInviteOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_manage],
)
async def invite_member(
    body: MemberInvite,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> MemberInviteOut:
    email = body.email.strip().lower()
    if not _EMAIL_RE.match(email):
        raise _error(status.HTTP_400_BAD_REQUEST, "members.email_invalid")

    car_wash_id = _normalize_scope(body.role, body.car_wash_id)
    _authorize_assignment(ctx, body.role, car_wash_id)

    if not supabase_admin.admin_configured():
        raise _error(status.HTTP_503_SERVICE_UNAVAILABLE, "members.admin_unavailable")

    # Provision the auth user, or reuse an existing one (attach a membership).
    password: str | None = supabase_admin.generate_temporary_password()
    try:
        user_id_str = await supabase_admin.create_confirmed_user(email, password or "", None)
        if user_id_str is None:
            password = None
            user_id_str = await supabase_admin.find_user_id_by_email(email)
    except supabase_admin.SupabaseAdminError as exc:
        raise _error(status.HTTP_503_SERVICE_UNAVAILABLE, "members.admin_unavailable") from exc
    if user_id_str is None:
        raise _error(status.HTTP_503_SERVICE_UNAVAILABLE, "members.admin_unavailable")
    user_id = uuid.UUID(user_id_str)

    existing = (
        await session.execute(
            select(Membership).where(
                Membership.user_id == user_id,
                Membership.organization_id == ctx.organization.id,
                Membership.car_wash_id.is_(None)
                if car_wash_id is None
                else Membership.car_wash_id == car_wash_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise _error(status.HTTP_409_CONFLICT, "members.already_member")

    membership = Membership(
        user_id=user_id,
        organization_id=ctx.organization.id,
        car_wash_id=car_wash_id,
        role=body.role,
    )
    session.add(membership)
    await session.commit()
    await session.refresh(membership)

    names = await _car_wash_names(session, ctx.organization.id)
    member = await _member_out(session, membership, email=email, car_wash_names=names)
    return MemberInviteOut(member=member, temporary_password=password)


async def _load_target(
    session: AsyncSession, ctx: TenantContext, membership_id: uuid.UUID
) -> Membership:
    membership = (
        await session.execute(
            select(Membership).where(
                Membership.id == membership_id,
                Membership.organization_id == ctx.organization.id,
            )
        )
    ).scalar_one_or_none()
    if membership is None:
        raise _error(status.HTTP_404_NOT_FOUND, "members.not_found")
    return membership


@router.patch("/members/{membership_id}", response_model=MemberOut, dependencies=[_manage])
async def update_member(
    membership_id: uuid.UUID,
    body: MemberRoleUpdate,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> MemberOut:
    membership = await _load_target(session, ctx, membership_id)
    _authorize_target(ctx, membership)

    car_wash_id = _normalize_scope(body.role, body.car_wash_id)
    _authorize_assignment(ctx, body.role, car_wash_id)

    membership.role = body.role
    membership.car_wash_id = car_wash_id
    await session.commit()
    await session.refresh(membership)

    emails = await _emails_for(session, [membership.user_id])
    names = await _car_wash_names(session, ctx.organization.id)
    return await _member_out(
        session, membership, email=emails.get(membership.user_id), car_wash_names=names
    )


@router.delete(
    "/members/{membership_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[_manage]
)
async def remove_member(
    membership_id: uuid.UUID,
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_session),
) -> None:
    membership = await _load_target(session, ctx, membership_id)
    _authorize_target(ctx, membership)
    if membership.user_id == ctx.user_id:
        raise _error(status.HTTP_409_CONFLICT, "members.cannot_remove_self")

    # Remove the membership only; the auth user and profile are left intact.
    await session.delete(membership)
    await session.commit()
