"""add is_active archival flags to boxes and car types

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "boxes",
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
    )
    op.add_column(
        "car_types",
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("car_types", "is_active")
    op.drop_column("boxes", "is_active")
