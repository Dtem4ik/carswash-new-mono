"""scope cars to organization and snapshot car type

Adds cars.organization_id (backfilled from client_cars -> clients) and a
functional unique index deduplicating cars per organization by a normalized
plate: upper(regexp_replace(plate, '\\s', '', 'g')) — uppercased with all
whitespace removed. Also adds orders.car_type_id snapshotting the body class
used for pricing at sale time.

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # cars.organization_id: nullable -> backfill via client_cars -> NOT NULL.
    op.add_column("cars", sa.Column("organization_id", sa.Uuid(), nullable=True))
    op.execute(
        """
        UPDATE cars ca
        SET organization_id = cl.organization_id
        FROM client_cars cc
        JOIN clients cl ON cl.id = cc.client_id
        WHERE cc.car_id = ca.id
        """
    )
    op.alter_column("cars", "organization_id", nullable=False)
    op.create_index(op.f("ix_cars_organization_id"), "cars", ["organization_id"])
    op.create_foreign_key(
        op.f("fk_cars_organization_id_organizations"),
        "cars",
        "organizations",
        ["organization_id"],
        ["id"],
        ondelete="CASCADE",
    )
    # Dedup per organization by normalized plate (uppercased, whitespace removed).
    op.execute(
        r"""
        CREATE UNIQUE INDEX uq_cars_organization_id_plate_norm
        ON cars (organization_id, upper(regexp_replace(plate, '\s', '', 'g')))
        """
    )

    # orders.car_type_id: nullable -> backfill via client_cars -> NOT NULL.
    op.add_column("orders", sa.Column("car_type_id", sa.Uuid(), nullable=True))
    op.execute(
        """
        UPDATE orders o
        SET car_type_id = c.car_type_id
        FROM client_cars cc
        JOIN cars c ON c.id = cc.car_id
        WHERE cc.id = o.client_car_id
        """
    )
    op.alter_column("orders", "car_type_id", nullable=False)
    op.create_index(op.f("ix_orders_car_type_id"), "orders", ["car_type_id"])
    op.create_foreign_key(
        op.f("fk_orders_car_type_id_car_types"),
        "orders",
        "car_types",
        ["car_type_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("fk_orders_car_type_id_car_types"), "orders", type_="foreignkey")
    op.drop_index(op.f("ix_orders_car_type_id"), table_name="orders")
    op.drop_column("orders", "car_type_id")

    op.execute("DROP INDEX IF EXISTS uq_cars_organization_id_plate_norm")
    op.drop_constraint(op.f("fk_cars_organization_id_organizations"), "cars", type_="foreignkey")
    op.drop_index(op.f("ix_cars_organization_id"), table_name="cars")
    op.drop_column("cars", "organization_id")
