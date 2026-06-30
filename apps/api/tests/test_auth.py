"""Auth & tenancy: capability matrix, JWT verification, and tenant isolation.

The capability tests are pure and always run. The ``/me`` tenant-context tests
mint HS256 tokens for the seeded demo users (signed with SUPABASE_JWT_SECRET) and
hit a real database; they are skipped when no DB / secret is configured (CI).
"""

from __future__ import annotations

import ssl
import time
import uuid
from collections.abc import AsyncIterator

import jwt
import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.auth.capabilities import Capability, can, capabilities_for
from app.config import settings
from app.db import _async_url
from app.deps import get_session
from app.main import app
from app.models.enums import MembershipRole

client = TestClient(app)

# --- capability matrix (pure, always runs) ------------------------------------


def test_capabilities_owner_is_superset_of_washer() -> None:
    assert capabilities_for(MembershipRole.washer) <= capabilities_for(MembershipRole.owner)
    assert capabilities_for(MembershipRole.manager) <= capabilities_for(MembershipRole.owner)


def test_only_privileged_roles_close_orders_and_edit_pricing() -> None:
    for role in (MembershipRole.owner, MembershipRole.org_admin, MembershipRole.manager):
        assert can(role, Capability.ORDERS_CLOSE)
        assert can(role, Capability.PRICING_EDIT)
    assert not can(MembershipRole.washer, Capability.ORDERS_CLOSE)
    assert not can(MembershipRole.washer, Capability.PRICING_EDIT)


def test_washer_is_read_only_operationally() -> None:
    # Web MVP: a washer reads orders but does not create them or manage users.
    assert can(MembershipRole.washer, Capability.ORDERS_VIEW)
    assert not can(MembershipRole.washer, Capability.ORDERS_CREATE)
    assert can(MembershipRole.manager, Capability.ORDERS_CREATE)
    assert not can(MembershipRole.washer, Capability.USERS_MANAGE)
    # A manager may manage staff (washers at their own car wash; the members
    # endpoints enforce that narrowing), but never car washes themselves.
    assert can(MembershipRole.manager, Capability.USERS_MANAGE)
    assert not can(MembershipRole.manager, Capability.CAR_WASH_MANAGE)
    assert can(MembershipRole.org_admin, Capability.USERS_MANAGE)
    assert can(MembershipRole.org_admin, Capability.CAR_WASH_MANAGE)


# --- JWT verification (no DB needed for these) --------------------------------


def test_me_without_token_is_401() -> None:
    resp = client.get("/me")
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "auth.missing_token"


def test_me_with_malformed_token_is_401() -> None:
    resp = client.get("/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "auth.invalid_token"


# --- tenant context against the seeded demo users (DB + secret gated) ---------

_db_ready = bool(settings.postgres_url and settings.supabase_jwt_secret)
needs_db = pytest.mark.skipif(
    not _db_ready,
    reason="no database / JWT secret configured (set POSTGRES_URL + SUPABASE_JWT_SECRET)",
)


def _ssl_ctx() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


async def _session_override() -> AsyncIterator[AsyncSession]:
    """Per-request NullPool engine so async connections never cross event loops."""
    url = _async_url(settings.postgres_url or "")
    engine = create_async_engine(
        url, connect_args={"statement_cache_size": 0, "ssl": _ssl_ctx()}, poolclass=NullPool
    )
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            yield session
    finally:
        await engine.dispose()


app.dependency_overrides[get_session] = _session_override


def _sync_engine() -> sa.Engine:
    raw = settings.postgres_url_non_pooling or ""
    url = "postgresql+psycopg://" + raw.split("://", 1)[1]
    if "sslmode=" not in url:
        url += ("&" if "?" in url else "?") + "sslmode=require"
    return sa.create_engine(url, future=True)


def _user_id(email: str) -> uuid.UUID:
    with _sync_engine().connect() as conn:
        row = conn.execute(
            sa.text("SELECT id FROM auth.users WHERE email = :e"), {"e": email}
        ).scalar_one()
    return uuid.UUID(str(row))


def _car_wash_id(name: str) -> uuid.UUID:
    with _sync_engine().connect() as conn:
        row = conn.execute(
            sa.text("SELECT id FROM car_washes WHERE name = :n"), {"n": name}
        ).scalar_one()
    return uuid.UUID(str(row))


def _token(sub: uuid.UUID, *, exp_delta: int = 3600) -> str:
    now = int(time.time())
    payload = {"sub": str(sub), "aud": "authenticated", "iat": now, "exp": now + exp_delta}
    return jwt.encode(payload, settings.supabase_jwt_secret or "", algorithm="HS256")


@needs_db
def test_me_expired_token_is_401() -> None:
    token = _token(_user_id("owner@carswash-demo.com"), exp_delta=-60)
    resp = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "auth.expired_token"


@needs_db
def test_me_owner_sees_all_car_washes() -> None:
    token = _token(_user_id("owner@carswash-demo.com"))
    resp = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["role"] == "owner"
    names = {cw["name"] for cw in body["accessible_car_washes"]}
    assert {"Almaty Central", "Aqtobe West"} <= names
    assert "pricing.edit" in body["capabilities"]
    # Each accessible car wash carries an ISO 3166-1 alpha-2 country (seeded KZ).
    assert all(cw["country"] == "KZ" for cw in body["accessible_car_washes"])


@needs_db
def test_me_washer_sees_only_their_car_wash() -> None:
    token = _token(_user_id("washer@carswash-demo.com"))
    resp = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["role"] == "washer"
    names = [cw["name"] for cw in body["accessible_car_washes"]]
    assert names == ["Almaty Central"]
    assert body["active_car_wash_id"] is not None  # single wash auto-selected
    assert "orders.close" not in body["capabilities"]


@needs_db
def test_me_manager_role_and_single_wash() -> None:
    token = _token(_user_id("manager@carswash-demo.com"))
    resp = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["role"] == "manager"
    assert [cw["name"] for cw in body["accessible_car_washes"]] == ["Almaty Central"]


@needs_db
def test_me_washer_cannot_select_foreign_car_wash() -> None:
    token = _token(_user_id("washer@carswash-demo.com"))
    aqtobe = _car_wash_id("Aqtobe West")
    resp = client.get(
        "/me",
        headers={"Authorization": f"Bearer {token}", "X-Car-Wash-Id": str(aqtobe)},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "tenant.car_wash_forbidden"


@needs_db
def test_me_owner_can_select_a_specific_car_wash() -> None:
    token = _token(_user_id("owner@carswash-demo.com"))
    aqtobe = _car_wash_id("Aqtobe West")
    resp = client.get(
        "/me",
        headers={"Authorization": f"Bearer {token}", "X-Car-Wash-Id": str(aqtobe)},
    )
    assert resp.status_code == 200
    assert resp.json()["active_car_wash_id"] == str(aqtobe)
