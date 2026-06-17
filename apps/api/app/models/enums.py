"""Domain enumerations, backed by native Postgres enum types.

These carry stable codes only — never localized prose (ARCHITECTURE.md §8).
``create_type=False``: the enum types are created/dropped explicitly in the
Alembic migrations, not implicitly by ``create_all``.
"""

import enum

from sqlalchemy import Enum as SAEnum


class MembershipRole(enum.StrEnum):
    owner = "owner"
    org_admin = "org_admin"
    manager = "manager"
    washer = "washer"


class OrderStatus(enum.StrEnum):
    queued = "queued"
    in_progress = "in_progress"
    done = "done"
    cancelled = "cancelled"


class BoxStatus(enum.StrEnum):
    free = "free"
    busy = "busy"


class PaymentMethod(enum.StrEnum):
    cash = "cash"
    card = "card"
    transfer = "transfer"
    bonus = "bonus"


class PaymentKind(enum.StrEnum):
    payment = "payment"
    refund = "refund"


class OrderPaymentStatus(enum.StrEnum):
    unpaid = "unpaid"
    partial = "partial"
    paid = "paid"
    credit = "credit"
    refunded = "refunded"


class CashMovementType(enum.StrEnum):
    expense = "expense"
    payout = "payout"
    collection = "collection"
    deposit = "deposit"


class DiscountType(enum.StrEnum):
    none = "none"
    manual = "manual"
    loyalty = "loyalty"
    promo = "promo"
    subscription = "subscription"


class ClientKind(enum.StrEnum):
    walkin = "walkin"
    regular = "regular"
    corporate = "corporate"


def _values(e: type[enum.Enum]) -> list[str]:
    return [member.value for member in e]


membership_role_enum = SAEnum(
    MembershipRole,
    name="membership_role",
    create_type=False,
    values_callable=_values,
)
order_status_enum = SAEnum(
    OrderStatus,
    name="order_status",
    create_type=False,
    values_callable=_values,
)
box_status_enum = SAEnum(
    BoxStatus,
    name="box_status",
    create_type=False,
    values_callable=_values,
)
payment_method_enum = SAEnum(
    PaymentMethod,
    name="payment_method",
    create_type=False,
    values_callable=_values,
)
payment_kind_enum = SAEnum(
    PaymentKind,
    name="payment_kind",
    create_type=False,
    values_callable=_values,
)
order_payment_status_enum = SAEnum(
    OrderPaymentStatus,
    name="order_payment_status",
    create_type=False,
    values_callable=_values,
)
cash_movement_type_enum = SAEnum(
    CashMovementType,
    name="cash_movement_type",
    create_type=False,
    values_callable=_values,
)
discount_type_enum = SAEnum(
    DiscountType,
    name="discount_type",
    create_type=False,
    values_callable=_values,
)
client_kind_enum = SAEnum(
    ClientKind,
    name="client_kind",
    create_type=False,
    values_callable=_values,
)
