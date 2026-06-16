"""Catalog & pricing models (ARCHITECTURE.md §5).

Prices are stored per car wash. Amounts are integer minor units
(``*_amount_minor``); the currency is the organization's currency, resolved on
read — catalog rows do not carry a currency.
"""

import uuid

from sqlalchemy import BigInteger, Boolean, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, uuid_pk


class CarType(Base):
    """Body class (sedan, SUV, …); per organization."""

    __tablename__ = "car_types"

    id: Mapped[uuid.UUID] = uuid_pk()
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    sort: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")


class Service(Base):
    """Service definition; per organization."""

    __tablename__ = "services"

    id: Mapped[uuid.UUID] = uuid_pk()
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")


class ServicePrice(Base):
    """Price of a service for a car type, at a given car wash."""

    __tablename__ = "service_prices"
    __table_args__ = (UniqueConstraint("car_wash_id", "service_id", "car_type_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    car_wash_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("car_washes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    service_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("services.id", ondelete="CASCADE"), nullable=False, index=True
    )
    car_type_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("car_types.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)


class Package(Base):
    """A bundle of services; per organization."""

    __tablename__ = "packages"

    id: Mapped[uuid.UUID] = uuid_pk()
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")


class PackageService(Base):
    """Membership of a service in a package."""

    __tablename__ = "package_services"
    __table_args__ = (UniqueConstraint("package_id", "service_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    package_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("packages.id", ondelete="CASCADE"), nullable=False, index=True
    )
    service_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("services.id", ondelete="CASCADE"), nullable=False, index=True
    )


class PackagePrice(Base):
    """Price of a package for a car type, at a given car wash."""

    __tablename__ = "package_prices"
    __table_args__ = (UniqueConstraint("car_wash_id", "package_id", "car_type_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    car_wash_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("car_washes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    package_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("packages.id", ondelete="CASCADE"), nullable=False, index=True
    )
    car_type_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("car_types.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
