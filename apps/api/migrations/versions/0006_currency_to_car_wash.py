"""move currency to car wash with org default

Renames organizations.currency -> default_currency and adds a per-car-wash
currency, backfilled from the organization's default. Going forward, an order
snapshots its car wash's currency at sale time.

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Organization currency becomes the org default.
    op.alter_column("organizations", "currency", new_column_name="default_currency")

    # Add car_wash currency: nullable -> backfill from org default -> NOT NULL.
    op.add_column("car_washes", sa.Column("currency", sa.CHAR(length=3), nullable=True))
    op.execute(
        """
        UPDATE car_washes cw
        SET currency = o.default_currency
        FROM organizations o
        WHERE o.id = cw.organization_id
        """
    )
    op.alter_column("car_washes", "currency", nullable=False)


def downgrade() -> None:
    op.drop_column("car_washes", "currency")
    op.alter_column("organizations", "default_currency", new_column_name="currency")
