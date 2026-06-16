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
