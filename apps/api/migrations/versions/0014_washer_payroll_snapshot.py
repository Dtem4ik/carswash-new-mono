"""snapshot washer payroll on order_washers

share_bps is a washer's slice of the washer pool in basis points; the pay is
snapshotted at sale time in earned_amount_minor so historical payroll never
moves when rate configuration changes. The rate-config source (per-service or
per-car-wash policy) is deferred to a later phase — these columns are the seam.

Revision ID: 0014
Revises: 0013
Create Date: 2026-06-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "order_washers", sa.Column("share_bps", sa.Integer(), server_default="0", nullable=False)
    )
    op.add_column(
        "order_washers",
        sa.Column("earned_amount_minor", sa.BigInteger(), server_default="0", nullable=False),
    )
    op.create_check_constraint(
        op.f("ck_order_washers_share_bps_nonneg"), "order_washers", "share_bps >= 0"
    )
    op.create_check_constraint(
        op.f("ck_order_washers_earned_amount_minor_nonneg"),
        "order_washers",
        "earned_amount_minor >= 0",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_order_washers_earned_amount_minor_nonneg"), "order_washers", type_="check"
    )
    op.drop_constraint(op.f("ck_order_washers_share_bps_nonneg"), "order_washers", type_="check")
    op.drop_column("order_washers", "earned_amount_minor")
    op.drop_column("order_washers", "share_bps")
