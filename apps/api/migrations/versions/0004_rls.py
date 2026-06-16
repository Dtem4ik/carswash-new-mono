"""rls policies and auth_user_car_wash_ids helper

Row-Level Security for the realtime-exposed tables (orders, boxes). The web
subscribes to these directly via Supabase Realtime, so rows must be gated in
the database by the requesting user's memberships. Full RLS coverage of the
remaining tables is Phase 6.

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-16
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


HELPER_FN = """
CREATE OR REPLACE FUNCTION public.auth_user_car_wash_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
    -- Org-level memberships (car_wash_id IS NULL) expand to every car wash in
    -- the organization.
    SELECT cw.id
    FROM memberships m
    JOIN car_washes cw ON cw.organization_id = m.organization_id
    WHERE m.user_id = auth.uid() AND m.car_wash_id IS NULL
    UNION
    -- Location-level memberships map to the single car wash.
    SELECT m.car_wash_id
    FROM memberships m
    WHERE m.user_id = auth.uid() AND m.car_wash_id IS NOT NULL;
$$;
"""


def upgrade() -> None:
    op.execute(HELPER_FN)
    op.execute("GRANT EXECUTE ON FUNCTION public.auth_user_car_wash_ids() TO authenticated")

    for table in ("orders", "boxes"):
        op.execute(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY")
        # Realtime reads run as the authenticated role; grant SELECT so RLS
        # filters rows (without a grant the role is denied outright).
        op.execute(f"GRANT SELECT ON public.{table} TO authenticated")
        op.execute(
            f"""
            CREATE POLICY {table}_select_by_membership ON public.{table}
                FOR SELECT TO authenticated
                USING (car_wash_id IN (SELECT public.auth_user_car_wash_ids()));
            """
        )


def downgrade() -> None:
    for table in ("orders", "boxes"):
        op.execute(f"DROP POLICY IF EXISTS {table}_select_by_membership ON public.{table}")
        op.execute(f"REVOKE SELECT ON public.{table} FROM authenticated")
        op.execute(f"ALTER TABLE public.{table} DISABLE ROW LEVEL SECURITY")

    op.execute("REVOKE EXECUTE ON FUNCTION public.auth_user_car_wash_ids() FROM authenticated")
    op.execute("DROP FUNCTION IF EXISTS public.auth_user_car_wash_ids()")
