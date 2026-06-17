"""add till reconciliation fields and cash movements

Shifts gain an opening cash float and, at close, the expected/counted cash and
who closed them — the variance is derivable. cash_movements records non-sale
cash events during a shift (expense, washer payout, collection, deposit) that
feed end-of-shift reconciliation.

Revision ID: 0012
Revises: 0011
Create Date: 2026-06-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

cash_movement_type = sa.Enum(
    "expense", "payout", "collection", "deposit", name="cash_movement_type", create_type=False
)


def upgrade() -> None:
    op.add_column(
        "shifts",
        sa.Column("closed_by", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "shifts",
        sa.Column("opening_float_minor", sa.BigInteger(), server_default="0", nullable=False),
    )
    op.add_column("shifts", sa.Column("counted_cash_minor", sa.BigInteger(), nullable=True))
    op.add_column("shifts", sa.Column("closing_expected_minor", sa.BigInteger(), nullable=True))
    op.create_index(op.f("ix_shifts_closed_by"), "shifts", ["closed_by"])
    op.create_foreign_key(
        op.f("fk_shifts_closed_by_users"),
        "shifts",
        "users",
        ["closed_by"],
        ["id"],
        referent_schema="auth",
        ondelete="RESTRICT",
    )
    op.create_check_constraint(
        op.f("ck_shifts_opening_float_minor_nonneg"), "shifts", "opening_float_minor >= 0"
    )
    op.create_check_constraint(
        op.f("ck_shifts_counted_cash_minor_nonneg"), "shifts", "counted_cash_minor >= 0"
    )

    # cash_movement_type is created implicitly by create_table below.
    op.create_table(
        "cash_movements",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("shift_id", sa.Uuid(), nullable=False),
        sa.Column("car_wash_id", sa.Uuid(), nullable=False),
        sa.Column("type", cash_movement_type, nullable=False),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("payee_user_id", sa.Uuid(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("amount_minor >= 0", name=op.f("ck_cash_movements_amount_minor_nonneg")),
        sa.ForeignKeyConstraint(
            ["shift_id"],
            ["shifts.id"],
            name=op.f("fk_cash_movements_shift_id_shifts"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["car_wash_id"],
            ["car_washes.id"],
            name=op.f("fk_cash_movements_car_wash_id_car_washes"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["payee_user_id"],
            ["auth.users.id"],
            name=op.f("fk_cash_movements_payee_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["auth.users.id"],
            name=op.f("fk_cash_movements_created_by_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cash_movements")),
    )
    op.create_index(op.f("ix_cash_movements_shift_id"), "cash_movements", ["shift_id"])
    op.create_index(op.f("ix_cash_movements_car_wash_id"), "cash_movements", ["car_wash_id"])
    op.create_index(op.f("ix_cash_movements_payee_user_id"), "cash_movements", ["payee_user_id"])
    op.create_index(op.f("ix_cash_movements_created_by"), "cash_movements", ["created_by"])


def downgrade() -> None:
    op.drop_index(op.f("ix_cash_movements_created_by"), table_name="cash_movements")
    op.drop_index(op.f("ix_cash_movements_payee_user_id"), table_name="cash_movements")
    op.drop_index(op.f("ix_cash_movements_car_wash_id"), table_name="cash_movements")
    op.drop_index(op.f("ix_cash_movements_shift_id"), table_name="cash_movements")
    op.drop_table("cash_movements")
    op.execute("DROP TYPE IF EXISTS cash_movement_type")

    op.drop_constraint(op.f("ck_shifts_counted_cash_minor_nonneg"), "shifts", type_="check")
    op.drop_constraint(op.f("ck_shifts_opening_float_minor_nonneg"), "shifts", type_="check")
    op.drop_constraint(op.f("fk_shifts_closed_by_users"), "shifts", type_="foreignkey")
    op.drop_index(op.f("ix_shifts_closed_by"), table_name="shifts")
    op.drop_column("shifts", "closing_expected_minor")
    op.drop_column("shifts", "counted_cash_minor")
    op.drop_column("shifts", "opening_float_minor")
    op.drop_column("shifts", "closed_by")
