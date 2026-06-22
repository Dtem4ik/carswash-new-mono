"""add country to car washes

Each car wash gains an ISO 3166-1 alpha-2 ``country`` code so the presentation
edge can render country-aware UI (e.g. the license-plate format) without binding
the system to any one country (ARCHITECTURE.md §8). Existing rows backfill to
``KZ`` via the column's server default; the column is NOT NULL.

Revision ID: 0020
Revises: 0019
Create Date: 2026-06-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "car_washes",
        sa.Column("country", sa.CHAR(length=2), nullable=False, server_default="KZ"),
    )
    # Explicit backfill (redundant with the server default, but keeps intent clear).
    op.execute("UPDATE car_washes SET country = 'KZ' WHERE country IS NULL")


def downgrade() -> None:
    op.drop_column("car_washes", "country")
