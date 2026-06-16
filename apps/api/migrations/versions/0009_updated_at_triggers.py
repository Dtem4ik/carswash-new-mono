"""add updated_at columns with auto-update triggers

Adds updated_at to mutable tables and a shared set_updated_at() trigger
function with BEFORE UPDATE triggers so the column maintains itself.

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Mutable tables that carry an auto-maintained updated_at.
TABLES = (
    "organizations",
    "car_washes",
    "service_prices",
    "package_prices",
    "boxes",
    "clients",
    "cars",
    "orders",
)

# clock_timestamp() (not now()) so updated_at reflects the actual moment of the
# UPDATE rather than the transaction start — and changes even within a tx.
SET_UPDATED_AT_FN = """
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = clock_timestamp();
    RETURN NEW;
END;
$$;
"""


def upgrade() -> None:
    for table in TABLES:
        # server_default now() backfills existing rows, satisfying NOT NULL.
        op.add_column(
            table,
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
        )
    op.execute(SET_UPDATED_AT_FN)
    for table in TABLES:
        op.execute(
            f"CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.{table} "
            f"FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()"
        )


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS set_updated_at ON public.{table}")
    op.execute("DROP FUNCTION IF EXISTS public.set_updated_at()")
    for table in reversed(TABLES):
        op.drop_column(table, "updated_at")
