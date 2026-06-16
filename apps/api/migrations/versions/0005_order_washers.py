"""track washers and finisher on orders

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "order_washers",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_order_washers_order_id_orders"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["auth.users.id"],
            name=op.f("fk_order_washers_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_order_washers")),
        sa.UniqueConstraint("order_id", "user_id", name=op.f("uq_order_washers_order_id")),
    )
    op.create_index(op.f("ix_order_washers_order_id"), "order_washers", ["order_id"])
    op.create_index(op.f("ix_order_washers_user_id"), "order_washers", ["user_id"])

    op.add_column("orders", sa.Column("finished_by", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_orders_finished_by"), "orders", ["finished_by"])
    op.create_foreign_key(
        op.f("fk_orders_finished_by_users"),
        "orders",
        "users",
        ["finished_by"],
        ["id"],
        referent_schema="auth",
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("fk_orders_finished_by_users"), "orders", type_="foreignkey")
    op.drop_index(op.f("ix_orders_finished_by"), table_name="orders")
    op.drop_column("orders", "finished_by")

    op.drop_index(op.f("ix_order_washers_user_id"), table_name="order_washers")
    op.drop_index(op.f("ix_order_washers_order_id"), table_name="order_washers")
    op.drop_table("order_washers")
