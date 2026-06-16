"""Tenancy & identity models (ARCHITECTURE.md §3, §5)."""

import datetime
import uuid

from sqlalchemy import CHAR, Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at_col, updated_at_col, uuid_pk
from app.models.enums import MembershipRole, membership_role_enum


class Organization(Base):
    """The network / owner account. Holds the default currency, locale, and plan."""

    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(Text, nullable=False)
    # ISO 4217 default currency; inherited by car washes that don't override it.
    default_currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    # BCP-47 locale used as the org default (presentation edge localizes).
    default_locale: Mapped[str] = mapped_column(String(35), nullable=False)
    plan: Mapped[str] = mapped_column(String(50), nullable=False, server_default="free")
    created_at: Mapped[datetime.datetime] = created_at_col()
    updated_at: Mapped[datetime.datetime] = updated_at_col()


class CarWash(Base):
    """A physical location. Holds its own IANA timezone and currency."""

    __tablename__ = "car_washes"

    id: Mapped[uuid.UUID] = uuid_pk()
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    # IANA timezone name, e.g. "Asia/Almaty".
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    # ISO 4217 currency for this location; orders snapshot it at sale time.
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime.datetime] = created_at_col()
    updated_at: Mapped[datetime.datetime] = updated_at_col()


class Profile(Base):
    """Mirror of ``auth.users``; ``id`` equals the Supabase auth user id."""

    __tablename__ = "profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("auth.users.id", ondelete="CASCADE"), primary_key=True
    )
    full_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    locale: Mapped[str | None] = mapped_column(String(35), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)


class Membership(Base):
    """Links a user to an organization, optionally scoped to one car wash.

    ``car_wash_id IS NULL`` + role owner/org_admin ⇒ access to every car wash in
    the organization; a set ``car_wash_id`` scopes to that single location.
    """

    __tablename__ = "memberships"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("auth.users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    car_wash_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("car_washes.id", ondelete="CASCADE"), nullable=True, index=True
    )
    role: Mapped[MembershipRole] = mapped_column(membership_role_enum, nullable=False)
