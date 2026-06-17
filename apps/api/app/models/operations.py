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
    ForeignKeyConstraint,
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
from app.models.enums import (
    BoxStatus,
    CashMovementType,
    ClientKind,
    DiscountType,
    OrderPaymentStatus,
    OrderStatus,
    PaymentKind,
    PaymentMethod,
    box_status_enum,
    cash_movement_type_enum,
    client_kind_enum,
    discount_type_enum,
    order_payment_status_enum,
    order_status_enum,
    payment_kind_enum,
    payment_method_enum,
)


class Box(Base):
    """A wash bay. Its status is derived from its active order."""

    __tablename__ = "boxes"
    # Composite-unique target so orders can carry a (car_wash_id, box_id) FK that
    # forbids referencing another car wash's box.
    __table_args__ = (UniqueConstraint("car_wash_id", "id"),)

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
    """An open/close work period at a car wash, with till reconciliation.

    The till is the cash drawer: it starts with an ``opening_float_minor`` and,
    at close, the system snapshots the expected cash (``closing_expected_minor``)
    and records the physically ``counted_cash_minor``; the variance is derivable.
    """

    __tablename__ = "shifts"
    __table_args__ = (
        # At most one open shift per car wash (Phase 3 gates orders on it).
        Index(
            "uq_shifts_one_open",
            "car_wash_id",
            unique=True,
            postgresql_where=text("closed_at IS NULL"),
        ),
        # Composite-unique target for the orders (car_wash_id, shift_id) FK.
        UniqueConstraint("car_wash_id", "id"),
        CheckConstraint("opening_float_minor >= 0", name="opening_float_minor_nonneg"),
        CheckConstraint("counted_cash_minor >= 0", name="counted_cash_minor_nonneg"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    car_wash_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("car_washes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    opened_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("auth.users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # Who closed the shift (set at close).
    closed_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("auth.users.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    opened_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    closed_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Cash in the drawer when the shift opens.
    opening_float_minor: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")
    # Physically counted cash at close (NULL until the shift is reconciled).
    counted_cash_minor: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    # Expected cash snapshotted at close (float + cash sales - cash out).
    closing_expected_minor: Mapped[int | None] = mapped_column(BigInteger, nullable=True)


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
    # walk-in (anonymous), regular (loyalty/subscription), or corporate (postpaid).
    kind: Mapped[ClientKind] = mapped_column(
        client_kind_enum, nullable=False, server_default=ClientKind.walkin.value
    )
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
        # Human-readable receipt number, unique and monotonic per car wash.
        UniqueConstraint("car_wash_id", "number"),
        # Money breakdown invariants (amounts are minor units, never negative).
        CheckConstraint("subtotal_minor >= 0", name="subtotal_minor_nonneg"),
        CheckConstraint("discount_amount_minor >= 0", name="discount_amount_minor_nonneg"),
        CheckConstraint("discount_amount_minor <= subtotal_minor", name="discount_le_subtotal"),
        CheckConstraint(
            "total_minor = subtotal_minor - discount_amount_minor",
            name="total_eq_subtotal_minus_discount",
        ),
        # Composite FKs: a box/shift must belong to the order's own car wash.
        ForeignKeyConstraint(
            ["car_wash_id", "box_id"],
            ["boxes.car_wash_id", "boxes.id"],
            name="fk_orders_car_wash_id_boxes",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["car_wash_id", "shift_id"],
            ["shifts.car_wash_id", "shifts.id"],
            name="fk_orders_car_wash_id_shifts",
            ondelete="RESTRICT",
        ),
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
    # Nullable for anonymous walk-ins ("washed and left"); plate is the snapshot.
    client_car_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("client_cars.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    # Anonymous-vehicle plate snapshot when no client_car is linked.
    plate: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Snapshot of the body class used for pricing at sale time.
    car_type_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("car_types.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # Receipt number, assigned per car wash at sale time (Phase 3).
    number: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[OrderStatus] = mapped_column(order_status_enum, nullable=False)
    # Money breakdown: total = subtotal - discount (all minor units, snapshotted).
    subtotal_minor: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")
    discount_amount_minor: Mapped[int] = mapped_column(
        BigInteger, nullable=False, server_default="0"
    )
    discount_type: Mapped[DiscountType] = mapped_column(
        discount_type_enum, nullable=False, server_default=DiscountType.none.value
    )
    total_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    payment_status: Mapped[OrderPaymentStatus] = mapped_column(
        order_payment_status_enum,
        nullable=False,
        server_default=OrderPaymentStatus.unpaid.value,
    )
    # Who authorized a discount (set when a discount is applied).
    authorized_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("auth.users.id", ondelete="RESTRICT"), nullable=True, index=True
    )
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
    """A washer assigned to an order (many washers may work one order).

    ``share_bps`` is this washer's slice of the washer pool in basis points
    (1/10000); ``earned_amount_minor`` is the pay **snapshotted** at sale time so
    historical payroll never moves when rate configuration changes later. The
    rate-config source (per-service / per-car-wash policy) is deferred to a later
    phase — these columns are the seam that must exist before any order is sold.
    """

    __tablename__ = "order_washers"
    __table_args__ = (
        UniqueConstraint("order_id", "user_id"),
        CheckConstraint("share_bps >= 0", name="share_bps_nonneg"),
        CheckConstraint("earned_amount_minor >= 0", name="earned_amount_minor_nonneg"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("auth.users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # Basis points (1/10000) of the washer pool for this washer.
    share_bps: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    # Pay snapshotted at sale time (minor units).
    earned_amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")


class Payment(Base):
    """A money movement against an order. Payments are the source of truth for an
    order's ``payment_status``; refunds are recorded as ``kind='refund'`` with a
    positive amount (never a negative payment)."""

    __tablename__ = "payments"
    __table_args__ = (CheckConstraint("amount_minor >= 0", name="amount_minor_nonneg"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    car_wash_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("car_washes.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    method: Mapped[PaymentMethod] = mapped_column(payment_method_enum, nullable=False)
    kind: Mapped[PaymentKind] = mapped_column(
        payment_kind_enum, nullable=False, server_default=PaymentKind.payment.value
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    received_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("auth.users.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    paid_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    created_at: Mapped[datetime.datetime] = created_at_col()
    updated_at: Mapped[datetime.datetime] = updated_at_col()


class CashMovement(Base):
    """A non-sale cash event during a shift: expense, washer payout, collection
    (инкассация), or deposit. Drives till reconciliation at shift close."""

    __tablename__ = "cash_movements"
    __table_args__ = (CheckConstraint("amount_minor >= 0", name="amount_minor_nonneg"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    shift_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("shifts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    car_wash_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("car_washes.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    type: Mapped[CashMovementType] = mapped_column(cash_movement_type_enum, nullable=False)
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # For payouts: the washer/staff paid.
    payee_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("auth.users.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("auth.users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    created_at: Mapped[datetime.datetime] = created_at_col()


class CarWashOrderCounter(Base):
    """Per-car-wash allocator for the monotonic order ``number``. Phase 3 locks
    the row and returns-then-increments ``next_number`` inside the order tx."""

    __tablename__ = "car_wash_order_counters"

    car_wash_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("car_washes.id", ondelete="CASCADE"), primary_key=True
    )
    next_number: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="1")
