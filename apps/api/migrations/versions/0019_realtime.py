"""publish orders and boxes tables for realtime

Adds public.orders and public.boxes to the Supabase ``supabase_realtime``
publication and sets ``REPLICA IDENTITY FULL`` on both, so realtime
UPDATE/DELETE events carry the full row (needed for client-side filtering by
``car_wash_id``). RLS on these tables (Phase 1) already gates rows per user, so
the realtime channel respects tenant isolation without going through the API.

The publication is created if it does not exist (portability to a non-Supabase
Postgres), and table membership is added idempotently.

Revision ID: 0019
Revises: 0018
Create Date: 2026-06-17
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PUBLICATION = "supabase_realtime"
TABLES = ("orders", "boxes")


def upgrade() -> None:
    op.execute(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_publication WHERE pubname = '{PUBLICATION}'
            ) THEN
                CREATE PUBLICATION {PUBLICATION};
            END IF;
        END $$;
        """
    )
    for table in TABLES:
        op.execute(f"ALTER TABLE public.{table} REPLICA IDENTITY FULL")
        op.execute(
            f"""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_publication_tables
                    WHERE pubname = '{PUBLICATION}'
                      AND schemaname = 'public'
                      AND tablename = '{table}'
                ) THEN
                    ALTER PUBLICATION {PUBLICATION} ADD TABLE public.{table};
                END IF;
            END $$;
            """
        )


def downgrade() -> None:
    for table in TABLES:
        op.execute(
            f"""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_publication_tables
                    WHERE pubname = '{PUBLICATION}'
                      AND schemaname = 'public'
                      AND tablename = '{table}'
                ) THEN
                    ALTER PUBLICATION {PUBLICATION} DROP TABLE public.{table};
                END IF;
            END $$;
            """
        )
        op.execute(f"ALTER TABLE public.{table} REPLICA IDENTITY DEFAULT")
