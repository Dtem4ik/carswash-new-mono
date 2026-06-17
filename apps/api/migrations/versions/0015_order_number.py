"""add per-car-wash order number with counter

orders gain a human-readable number, unique per car wash. A car_wash_order_counters
row holds the next number per car wash; Phase 3 locks the row and
returns-then-increments it inside the order transaction (monotonic, no daily
reset, no gaps under concurrency). orders is empty, so the NOT NULL column needs
no backfill.

Revision ID: 0015
Revises: 0014
Create Date: 2026-06-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("number", sa.BigInteger(), nullable=False))
    op.create_unique_constraint(op.f("uq_orders_car_wash_id"), "orders", ["car_wash_id", "number"])

    op.create_table(
        "car_wash_order_counters",
        sa.Column("car_wash_id", sa.Uuid(), nullable=False),
        sa.Column("next_number", sa.BigInteger(), server_default="1", nullable=False),
        sa.ForeignKeyConstraint(
            ["car_wash_id"],
            ["car_washes.id"],
            name=op.f("fk_car_wash_order_counters_car_wash_id_car_washes"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("car_wash_id", name=op.f("pk_car_wash_order_counters")),
    )


def downgrade() -> None:
    op.drop_table("car_wash_order_counters")
    op.drop_constraint(op.f("uq_orders_car_wash_id"), "orders", type_="unique")
    op.drop_column("orders", "number")
