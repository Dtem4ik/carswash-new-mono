"""Operations models: boxes, shifts, clients, cars, orders (ARCHITECTURE.md §5).

Money: ``*_amount_minor`` BIGINT minor units. Orders snapshot the currency
(CHAR(3)) at sale time. Time: all ``timestamptz`` in UTC.
"""

import datetime
import uuid

from sqlalchemy import (
    CHAR,
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at_col, updated_at_col, uuid_pk
from app.models.enums import BoxStatus, OrderStatus, box_status_enum, order_status_enum


class Box(Base):
    """A wash bay. Its status is derived from its active order."""

    __tablename__ = "boxes"

    id: Mapped[uuid.UUID] = uuid_pk()
    car_wash_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("car_washes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[BoxStatus] = mapped_column(
        box_status_enum, nullable=False, server_default=BoxStatus.free.value
    )
    # Nullable pointer to the order currently occupying the box (no FK: boxes and
    # orders reference each other; order.box_id carries the enforced constraint).
    active_order_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    sort: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    updated_at: Mapped[datetime.datetime] = updated_at_col()


class Shift(Base):
    """An open/close work period at a car wash."""

    __tablename__ = "shifts"

    id: Mapped[uuid.UUID] = uuid_pk()
    car_wash_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("car_washes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    opened_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("auth.users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    opened_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    closed_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class Client(Base):
    """A customer, registered at organization level."""

    __tablename__ = "clients"
    # Dedup customers by phone within an organization (NULL phones are exempt).
    __table_args__ = (
        Index(
            "uq_clients_organization_id_phone",
            "organization_id",
            "phone",
            unique=True,
            postgresql_where=text("phone IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    phone: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime.datetime] = updated_at_col()


class Car(Base):
    """A vehicle, scoped to an organization. Brand/model are free text for the MVP.

    Deduplicated per organization by a normalized plate (uppercased with
    whitespace removed) via a functional unique index created in the migration.
    """

    __tablename__ = "cars"

    id: Mapped[uuid.UUID] = uuid_pk()
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plate: Mapped[str] = mapped_column(Text, nullable=False)
    car_type_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("car_types.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    brand: Mapped[str | None] = mapped_column(Text, nullable=True)
    model: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime.datetime] = updated_at_col()


class ClientCar(Base):
    """Link between a client and a car."""

    __tablename__ = "client_cars"

    id: Mapped[uuid.UUID] = uuid_pk()
    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    car_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cars.id", ondelete="CASCADE"), nullable=False, index=True
    )


class Order(Base):
    """A wash order. Price and currency are snapshot at sale time."""

    __tablename__ = "orders"
    __table_args__ = (
        # Hot path: live board / queue per car wash, filtered by status.
        Index("ix_orders_car_wash_id_status", "car_wash_id", "status"),
        CheckConstraint("discount_pct >= 0 AND discount_pct <= 100", name="discount_pct_range"),
        CheckConstraint("price_amount_minor >= 0", name="price_amount_minor_nonneg"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    car_wash_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("car_washes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    box_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("boxes.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    shift_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("shifts.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    client_car_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("client_cars.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # Snapshot of the body class used for pricing at sale time.
    car_type_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("car_types.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    status: Mapped[OrderStatus] = mapped_column(order_status_enum, nullable=False)
    price_amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    discount_pct: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    package_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("packages.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("auth.users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # Who closed the order (set when the order is finished).
    finished_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("auth.users.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    started_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime.datetime] = created_at_col()
    updated_at: Mapped[datetime.datetime] = updated_at_col()


class OrderService(Base):
    """A line item on an order, with the unit price snapshot."""

    __tablename__ = "order_services"
    __table_args__ = (CheckConstraint("unit_amount_minor >= 0", name="unit_amount_minor_nonneg"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    service_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("services.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    unit_amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    qty: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="1")


class OrderWasher(Base):
    """A washer assigned to an order (many washers may work one order)."""

    __tablename__ = "order_washers"
    __table_args__ = (UniqueConstraint("order_id", "user_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("auth.users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
