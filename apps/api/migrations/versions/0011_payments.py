"""add payments table and order payment status

Payments are a first-class entity (one order may have several: mixed tender,
prepay + top-up, refunds). Refunds are recorded as kind='refund' with a positive
amount — never a negative payment. Payments are the source of truth for an
order's payment_status (the app maintains the denormalized column).

Revision ID: 0011
Revises: 0010
Create Date: 2026-06-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

payment_method = sa.Enum(
    "cash", "card", "transfer", "bonus", name="payment_method", create_type=False
)
payment_kind = sa.Enum("payment", "refund", name="payment_kind", create_type=False)
order_payment_status = sa.Enum(
    "unpaid",
    "partial",
    "paid",
    "credit",
    "refunded",
    name="order_payment_status",
    create_type=False,
)


def upgrade() -> None:
    # payment_method / payment_kind are created implicitly by create_table below
    # (the generic sa.Enum emits CREATE TYPE on table create). order_payment_status
    # is only used in add_column, which does not auto-create it, so create it here.
    op.execute(
        "CREATE TYPE order_payment_status AS ENUM "
        "('unpaid', 'partial', 'paid', 'credit', 'refunded')"
    )

    op.create_table(
        "payments",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("car_wash_id", sa.Uuid(), nullable=False),
        sa.Column("method", payment_method, nullable=False),
        sa.Column("kind", payment_kind, server_default="payment", nullable=False),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.CHAR(length=3), nullable=False),
        sa.Column("received_by", sa.Uuid(), nullable=True),
        sa.Column(
            "paid_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("amount_minor >= 0", name=op.f("ck_payments_amount_minor_nonneg")),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_payments_order_id_orders"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["car_wash_id"],
            ["car_washes.id"],
            name=op.f("fk_payments_car_wash_id_car_washes"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["received_by"],
            ["auth.users.id"],
            name=op.f("fk_payments_received_by_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payments")),
    )
    op.create_index(op.f("ix_payments_order_id"), "payments", ["order_id"])
    op.create_index(op.f("ix_payments_car_wash_id"), "payments", ["car_wash_id"])
    op.create_index(op.f("ix_payments_received_by"), "payments", ["received_by"])
    # updated_at is kept current by the shared trigger function (from 0009).
    op.execute(
        "CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.payments "
        "FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()"
    )

    op.add_column(
        "orders",
        sa.Column("payment_status", order_payment_status, server_default="unpaid", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("orders", "payment_status")

    op.execute("DROP TRIGGER IF EXISTS set_updated_at ON public.payments")
    op.drop_index(op.f("ix_payments_received_by"), table_name="payments")
    op.drop_index(op.f("ix_payments_car_wash_id"), table_name="payments")
    op.drop_index(op.f("ix_payments_order_id"), table_name="payments")
    op.drop_table("payments")

    op.execute("DROP TYPE IF EXISTS order_payment_status")
    op.execute("DROP TYPE IF EXISTS payment_kind")
    op.execute("DROP TYPE IF EXISTS payment_method")
