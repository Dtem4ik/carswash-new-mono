"""support anonymous walk-in orders and client kind

The high-frequency "washed and left" path should not force a client+car row:
orders.client_car_id becomes nullable and a plate snapshot is added for
anonymous vehicles (car_type_id already covers pricing). clients gain a kind
(walk-in / regular / corporate) to drive loyalty and postpaid behaviour later.

Revision ID: 0016
Revises: 0015
Create Date: 2026-06-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

client_kind = sa.Enum("walkin", "regular", "corporate", name="client_kind", create_type=False)


def upgrade() -> None:
    op.alter_column("orders", "client_car_id", existing_type=sa.Uuid(), nullable=True)
    op.add_column("orders", sa.Column("plate", sa.Text(), nullable=True))

    op.execute("CREATE TYPE client_kind AS ENUM ('walkin', 'regular', 'corporate')")
    op.add_column(
        "clients", sa.Column("kind", client_kind, server_default="walkin", nullable=False)
    )


def downgrade() -> None:
    op.drop_column("clients", "kind")
    op.execute("DROP TYPE IF EXISTS client_kind")

    op.drop_column("orders", "plate")
    op.alter_column("orders", "client_car_id", existing_type=sa.Uuid(), nullable=False)
