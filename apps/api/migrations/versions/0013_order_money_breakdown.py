"""money breakdown with discount provenance on orders

Replaces the single price_amount_minor + discount_pct with an explicit money
breakdown: subtotal_minor (pre-discount), discount_amount_minor (exact money),
total_minor (net), plus discount_type and authorized_by for provenance. The
invariant total = subtotal - discount is enforced by a CHECK. orders is empty,
so no backfill is needed.

Revision ID: 0013
Revises: 0012
Create Date: 2026-06-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

discount_type = sa.Enum(
    "none", "manual", "loyalty", "promo", "subscription", name="discount_type", create_type=False
)


def upgrade() -> None:
    # Drop the old single-figure money model.
    op.drop_constraint("ck_orders_discount_pct_range", "orders", type_="check")
    op.drop_constraint("ck_orders_price_amount_minor_nonneg", "orders", type_="check")
    op.drop_column("orders", "discount_pct")
    op.alter_column("orders", "price_amount_minor", new_column_name="total_minor")

    op.execute(
        "CREATE TYPE discount_type AS ENUM ('none', 'manual', 'loyalty', 'promo', 'subscription')"
    )
    op.add_column(
        "orders", sa.Column("subtotal_minor", sa.BigInteger(), server_default="0", nullable=False)
    )
    op.add_column(
        "orders",
        sa.Column("discount_amount_minor", sa.BigInteger(), server_default="0", nullable=False),
    )
    op.add_column(
        "orders", sa.Column("discount_type", discount_type, server_default="none", nullable=False)
    )
    op.add_column("orders", sa.Column("authorized_by", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_orders_authorized_by"), "orders", ["authorized_by"])
    op.create_foreign_key(
        op.f("fk_orders_authorized_by_users"),
        "orders",
        "users",
        ["authorized_by"],
        ["id"],
        referent_schema="auth",
        ondelete="RESTRICT",
    )

    op.create_check_constraint(
        op.f("ck_orders_subtotal_minor_nonneg"), "orders", "subtotal_minor >= 0"
    )
    op.create_check_constraint(
        op.f("ck_orders_discount_amount_minor_nonneg"), "orders", "discount_amount_minor >= 0"
    )
    op.create_check_constraint(
        op.f("ck_orders_discount_le_subtotal"), "orders", "discount_amount_minor <= subtotal_minor"
    )
    op.create_check_constraint(
        op.f("ck_orders_total_eq_subtotal_minus_discount"),
        "orders",
        "total_minor = subtotal_minor - discount_amount_minor",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_orders_total_eq_subtotal_minus_discount"), "orders", type_="check")
    op.drop_constraint(op.f("ck_orders_discount_le_subtotal"), "orders", type_="check")
    op.drop_constraint(op.f("ck_orders_discount_amount_minor_nonneg"), "orders", type_="check")
    op.drop_constraint(op.f("ck_orders_subtotal_minor_nonneg"), "orders", type_="check")

    op.drop_constraint(op.f("fk_orders_authorized_by_users"), "orders", type_="foreignkey")
    op.drop_index(op.f("ix_orders_authorized_by"), table_name="orders")
    op.drop_column("orders", "authorized_by")
    op.drop_column("orders", "discount_type")
    op.execute("DROP TYPE IF EXISTS discount_type")
    op.drop_column("orders", "discount_amount_minor")
    op.drop_column("orders", "subtotal_minor")

    op.alter_column("orders", "total_minor", new_column_name="price_amount_minor")
    op.add_column(
        "orders", sa.Column("discount_pct", sa.SmallInteger(), server_default="0", nullable=False)
    )
    op.create_check_constraint(
        "ck_orders_price_amount_minor_nonneg", "orders", "price_amount_minor >= 0"
    )
    op.create_check_constraint(
        "ck_orders_discount_pct_range", "orders", "discount_pct >= 0 AND discount_pct <= 100"
    )
