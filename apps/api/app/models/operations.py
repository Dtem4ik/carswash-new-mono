"""Operations models: boxes, shifts, clients, cars, orders (ARCHITECTURE.md §5).

Money: ``*_amount_minor`` BIGINT minor units. Orders snapshot the currency
(CHAR(3)) at sale time. Time: all ``timestamptz`` in UTC.
"""

import datetime
import uuid

from sqlalchemy import (
    CHAR,
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    Text,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at_col, uuid_pk
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

    id: Mapped[uuid.UUID] = uuid_pk()
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    phone: Mapped[str | None] = mapped_column(Text, nullable=True)


class Car(Base):
    """A vehicle. Brand/model are free text for the MVP."""

    __tablename__ = "cars"

    id: Mapped[uuid.UUID] = uuid_pk()
    plate: Mapped[str] = mapped_column(Text, nullable=False)
    car_type_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("car_types.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    brand: Mapped[str | None] = mapped_column(Text, nullable=True)
    model: Mapped[str | None] = mapped_column(Text, nullable=True)


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
    # Hot path: live board / queue per car wash, filtered by status.
    __table_args__ = (Index("ix_orders_car_wash_id_status", "car_wash_id", "status"),)

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
    started_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime.datetime] = created_at_col()


class OrderService(Base):
    """A line item on an order, with the unit price snapshot."""

    __tablename__ = "order_services"

    id: Mapped[uuid.UUID] = uuid_pk()
    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    service_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("services.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    unit_amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    qty: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="1")
