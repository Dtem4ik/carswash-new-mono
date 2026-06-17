"""enforce single open shift and cross-wash integrity

A partial unique index allows at most one open shift per car wash. Composite
unique keys on boxes and shifts (car_wash_id, id) let orders carry composite FKs
that make it impossible to reference a box/shift belonging to another car wash —
tenant isolation by construction, not just by app code.

Revision ID: 0017
Revises: 0016
Create Date: 2026-06-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # At most one open shift per car wash.
    op.create_index(
        "uq_shifts_one_open",
        "shifts",
        ["car_wash_id"],
        unique=True,
        postgresql_where=sa.text("closed_at IS NULL"),
    )

    # Composite-unique targets for the orders composite FKs.
    op.create_unique_constraint(op.f("uq_boxes_car_wash_id"), "boxes", ["car_wash_id", "id"])
    op.create_unique_constraint(op.f("uq_shifts_car_wash_id"), "shifts", ["car_wash_id", "id"])

    # An order's box/shift must belong to the order's own car wash.
    op.create_foreign_key(
        "fk_orders_car_wash_id_boxes",
        "orders",
        "boxes",
        ["car_wash_id", "box_id"],
        ["car_wash_id", "id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_orders_car_wash_id_shifts",
        "orders",
        "shifts",
        ["car_wash_id", "shift_id"],
        ["car_wash_id", "id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint("fk_orders_car_wash_id_shifts", "orders", type_="foreignkey")
    op.drop_constraint("fk_orders_car_wash_id_boxes", "orders", type_="foreignkey")
    op.drop_constraint(op.f("uq_shifts_car_wash_id"), "shifts", type_="unique")
    op.drop_constraint(op.f("uq_boxes_car_wash_id"), "boxes", type_="unique")
    op.drop_index(
        "uq_shifts_one_open", table_name="shifts", postgresql_where=sa.text("closed_at IS NULL")
    )
