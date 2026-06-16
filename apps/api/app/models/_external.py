"""References to Supabase-managed tables we do not own.

``auth.users`` is created and managed by Supabase Auth. We declare a minimal
reference so SQLAlchemy ``ForeignKey("auth.users.id")`` targets resolve. Our
Alembic migrations never CREATE or DROP this table (see ``env.py``).
"""

from sqlalchemy import Column, Table, Uuid

from app.models.base import Base

auth_users = Table(
    "users",
    Base.metadata,
    Column("id", Uuid, primary_key=True),
    schema="auth",
)
"""Reference to ``auth.users`` (Supabase-managed). Not emitted by migrations."""
