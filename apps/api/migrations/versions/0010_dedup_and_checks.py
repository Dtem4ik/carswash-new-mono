"""add dedup constraints and integrity checks

A partial unique index dedups clients by phone within an organization, and
CHECK constraints enforce a valid discount percentage and non-negative money.

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (constraint_name, table, condition) for non-negative money + discount range.
CHECKS = (
    ("ck_orders_discount_pct_range", "orders", "discount_pct >= 0 AND discount_pct <= 100"),
    ("ck_orders_price_amount_minor_nonneg", "orders", "price_amount_minor >= 0"),
    ("ck_order_services_unit_amount_minor_nonneg", "order_services", "unit_amount_minor >= 0"),
    ("ck_service_prices_amount_minor_nonneg", "service_prices", "amount_minor >= 0"),
    ("ck_package_prices_amount_minor_nonneg", "package_prices", "amount_minor >= 0"),
)


def upgrade() -> None:
    op.create_index(
        "uq_clients_organization_id_phone",
        "clients",
        ["organization_id", "phone"],
        unique=True,
        postgresql_where=sa.text("phone IS NOT NULL"),
    )
    for name, table, condition in CHECKS:
        op.create_check_constraint(name, table, condition)


def downgrade() -> None:
    for name, table, _condition in CHECKS:
        op.drop_constraint(name, table, type_="check")
    op.drop_index(
        "uq_clients_organization_id_phone",
        table_name="clients",
        postgresql_where=sa.text("phone IS NOT NULL"),
    )
