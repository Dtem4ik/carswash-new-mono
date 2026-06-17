"""create profiles automatically for new auth users

An AFTER INSERT trigger on the Supabase-managed auth.users table inserts a
matching public.profiles row, so every auth user gets a profile without an
extra round-trip. SECURITY DEFINER so it runs with the owner's rights
regardless of who creates the user (the GoTrue admin role).

Revision ID: 0018
Revises: 0017
Create Date: 2026-06-17
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


HANDLE_NEW_USER_FN = """
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.profiles (id)
    VALUES (NEW.id)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;
"""


def upgrade() -> None:
    op.execute(HANDLE_NEW_USER_FN)
    op.execute(
        "CREATE TRIGGER on_auth_user_created "
        "AFTER INSERT ON auth.users "
        "FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()"
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users")
    op.execute("DROP FUNCTION IF EXISTS public.handle_new_user()")
