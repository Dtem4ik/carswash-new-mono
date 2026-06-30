"""Phase 4d: staff & roles management — capability + tenant/manager isolation.

Builds two isolated orgs: org A (two car washes, an org-level org_admin, a
manager + a washer at A1, a washer at A2, plus spare auth users) and org B (one
org-level owner). The Supabase admin API is monkeypatched so invites never touch
the real auth service; the returned ids are pre-seeded auth users so the
membership FK holds. Skipped without a DB / JWT secret.
"""

from __future__ import annotations

import ssl
import time
import uuid
from collections.abc import AsyncIterator, Iterator

import jwt
import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.db import _async_url
from app.deps import get_session
from app.main import app
from app.services import supabase_admin

_db_ready = bool(settings.postgres_url and settings.supabase_jwt_secret)
pytestmark = pytest.mark.skipif(
    not _db_ready,
    reason="no database / JWT secret configured (set POSTGRES_URL + SUPABASE_JWT_SECRET)",
)

NS = uuid.UUID("00000000-0000-0000-0000-0000000004d0")


def _id(*parts: str) -> uuid.UUID:
    return uuid.uuid5(NS, "/".join(parts))


IDS = {
    "org_a": _id("org", "a"),
    "org_b": _id("org", "b"),
    "cw_a1": _id("cw", "a1"),
    "cw_a2": _id("cw", "a2"),
    "cw_b1": _id("cw", "b1"),
    # users
    "admin_a": _id("user", "admin_a"),
    "manager_a": _id("user", "manager_a"),
    "washer1": _id("user", "washer1"),
    "washer2": _id("user", "washer2"),
    "washer3": _id("user", "washer3"),
    "owner_b": _id("user", "owner_b"),
    "cand1": _id("user", "cand1"),
    "cand2": _id("user", "cand2"),
    # membership rows (explicit so PATCH/DELETE can target them)
    "m_admin": _id("m", "admin"),
    "m_manager": _id("m", "manager"),
    "m_washer1": _id("m", "washer1"),
    "m_washer2": _id("m", "washer2"),
    "m_washer3": _id("m", "washer3"),
    "m_owner_b": _id("m", "owner_b"),
}

_ALL_USERS = ("admin_a", "manager_a", "washer1", "washer2", "washer3", "owner_b", "cand1", "cand2")


def _ssl_ctx() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


async def _session_override() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(
        _async_url(settings.postgres_url or ""),
        connect_args={"statement_cache_size": 0, "ssl": _ssl_ctx()},
        poolclass=NullPool,
    )
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            yield session
    finally:
        await engine.dispose()


app.dependency_overrides[get_session] = _session_override
client = TestClient(app)


def _sync_engine() -> sa.Engine:
    raw = settings.postgres_url_non_pooling or ""
    url = "postgresql+psycopg://" + raw.split("://", 1)[1]
    if "sslmode=" not in url:
        url += ("&" if "?" in url else "?") + "sslmode=require"
    return sa.create_engine(url, future=True)


def _teardown(conn: sa.Connection) -> None:
    conn.execute(
        sa.text("DELETE FROM organizations WHERE id IN (:a, :b)"),
        {"a": IDS["org_a"], "b": IDS["org_b"]},
    )
    conn.execute(
        sa.text("DELETE FROM auth.users WHERE id = ANY(:ids)"),
        {"ids": [IDS[k] for k in _ALL_USERS]},
    )


def _setup(conn: sa.Connection) -> None:
    _teardown(conn)
    for key in _ALL_USERS:
        conn.execute(
            sa.text("INSERT INTO auth.users (id, email) VALUES (:id, :email)"),
            {"id": IDS[key], "email": f"{key}@carswash-test.com"},
        )
    conn.execute(
        sa.text(
            "INSERT INTO organizations (id, name, default_currency, default_locale) VALUES"
            " (:a, 'Org A', 'KZT', 'ru'), (:b, 'Org B', 'KZT', 'ru')"
        ),
        {"a": IDS["org_a"], "b": IDS["org_b"]},
    )
    conn.execute(
        sa.text(
            "INSERT INTO car_washes (id, organization_id, name, timezone, currency) VALUES"
            " (:a1, :a, 'A1', 'Asia/Almaty', 'KZT'),"
            " (:a2, :a, 'A2', 'Asia/Aqtobe', 'KZT'),"
            " (:b1, :b, 'B1', 'Asia/Almaty', 'KZT')"
        ),
        {
            "a1": IDS["cw_a1"],
            "a2": IDS["cw_a2"],
            "b1": IDS["cw_b1"],
            "a": IDS["org_a"],
            "b": IDS["org_b"],
        },
    )
    conn.execute(
        sa.text(
            "INSERT INTO memberships (id, user_id, organization_id, car_wash_id, role) VALUES"
            " (:m_admin, :admin_a, :a, NULL, 'org_admin'::membership_role),"
            " (:m_manager, :manager_a, :a, :a1, 'manager'::membership_role),"
            " (:m_washer1, :washer1, :a, :a1, 'washer'::membership_role),"
            " (:m_washer2, :washer2, :a, :a2, 'washer'::membership_role),"
            " (:m_washer3, :washer3, :a, :a1, 'washer'::membership_role),"
            " (:m_owner_b, :owner_b, :b, NULL, 'owner'::membership_role)"
        ),
        {
            "m_admin": IDS["m_admin"],
            "m_manager": IDS["m_manager"],
            "m_washer1": IDS["m_washer1"],
            "m_washer2": IDS["m_washer2"],
            "m_washer3": IDS["m_washer3"],
            "m_owner_b": IDS["m_owner_b"],
            "admin_a": IDS["admin_a"],
            "manager_a": IDS["manager_a"],
            "washer1": IDS["washer1"],
            "washer2": IDS["washer2"],
            "washer3": IDS["washer3"],
            "owner_b": IDS["owner_b"],
            "a": IDS["org_a"],
            "b": IDS["org_b"],
            "a1": IDS["cw_a1"],
            "a2": IDS["cw_a2"],
        },
    )


@pytest.fixture(scope="module", autouse=True)
def _fixtures() -> Iterator[None]:
    engine = _sync_engine()
    with engine.begin() as conn:
        _setup(conn)
    yield
    with engine.begin() as conn:
        _teardown(conn)
    engine.dispose()


@pytest.fixture(autouse=True)
def _fake_admin(monkeypatch: pytest.MonkeyPatch) -> None:
    """Map invited emails to pre-seeded auth users; never call the real service."""
    existing = {
        "washer1@carswash-test.com": IDS["washer1"],
        "attach@carswash-test.com": IDS["cand2"],
    }

    async def fake_create(email: str, password: str, full_name: str | None) -> str | None:
        if email in existing:
            return None
        return str(IDS["cand1"])

    async def fake_find(email: str) -> str | None:
        found = existing.get(email)
        return str(found) if found else None

    monkeypatch.setattr(supabase_admin, "admin_configured", lambda: True)
    monkeypatch.setattr(supabase_admin, "create_confirmed_user", fake_create)
    monkeypatch.setattr(supabase_admin, "find_user_id_by_email", fake_find)
    monkeypatch.setattr(supabase_admin, "generate_temporary_password", lambda: "temp-secret-123")


def _token(sub: uuid.UUID) -> str:
    now = int(time.time())
    payload = {"sub": str(sub), "aud": "authenticated", "iat": now, "exp": now + 3600}
    return jwt.encode(payload, settings.supabase_jwt_secret or "", algorithm="HS256")


def _headers(sub: uuid.UUID, car_wash_id: uuid.UUID | None = None) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {_token(sub)}"}
    if car_wash_id is not None:
        headers["X-Car-Wash-Id"] = str(car_wash_id)
    return headers


# --- capability ---------------------------------------------------------------


def test_washer_cannot_access_staff() -> None:
    resp = client.get("/members", headers=_headers(IDS["washer1"], IDS["cw_a1"]))
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "auth.forbidden"


# --- listing ------------------------------------------------------------------


def test_org_admin_lists_whole_org() -> None:
    resp = client.get("/members", headers=_headers(IDS["admin_a"]))
    assert resp.status_code == 200
    emails = {m["email"] for m in resp.json()}
    assert {
        "admin_a@carswash-test.com",
        "manager_a@carswash-test.com",
        "washer1@carswash-test.com",
        "washer2@carswash-test.com",
    } <= emails
    assert "owner_b@carswash-test.com" not in emails  # org isolation


def test_manager_lists_only_their_car_wash() -> None:
    resp = client.get("/members", headers=_headers(IDS["manager_a"]))
    assert resp.status_code == 200
    members = resp.json()
    assert all(m["car_wash_id"] == str(IDS["cw_a1"]) for m in members)
    emails = {m["email"] for m in members}
    assert "washer1@carswash-test.com" in emails
    assert "washer2@carswash-test.com" not in emails  # other car wash


# --- invite -------------------------------------------------------------------


def test_org_admin_invites_new_washer_with_temp_password() -> None:
    resp = client.post(
        "/members",
        json={
            "email": "Brand-New@carswash-test.com",
            "role": "washer",
            "car_wash_id": str(IDS["cw_a2"]),
        },
        headers=_headers(IDS["admin_a"], IDS["cw_a2"]),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["temporary_password"] == "temp-secret-123"
    assert body["member"]["role"] == "washer"
    assert body["member"]["car_wash_id"] == str(IDS["cw_a2"])
    assert body["member"]["email"] == "brand-new@carswash-test.com"  # normalized


def test_invite_existing_email_attaches_without_password() -> None:
    resp = client.post(
        "/members",
        json={
            "email": "attach@carswash-test.com",
            "role": "washer",
            "car_wash_id": str(IDS["cw_a1"]),
        },
        headers=_headers(IDS["admin_a"], IDS["cw_a1"]),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["temporary_password"] is None


def test_invite_already_member_conflicts() -> None:
    resp = client.post(
        "/members",
        json={
            "email": "washer1@carswash-test.com",
            "role": "washer",
            "car_wash_id": str(IDS["cw_a1"]),
        },
        headers=_headers(IDS["admin_a"], IDS["cw_a1"]),
    )
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "members.already_member"


def test_invalid_email_is_rejected() -> None:
    resp = client.post(
        "/members",
        json={"email": "not-an-email", "role": "washer", "car_wash_id": str(IDS["cw_a1"])},
        headers=_headers(IDS["admin_a"], IDS["cw_a1"]),
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "members.email_invalid"


def test_location_role_requires_car_wash() -> None:
    resp = client.post(
        "/members",
        json={"email": "fresh@carswash-test.com", "role": "washer"},
        headers=_headers(IDS["admin_a"]),
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "members.car_wash_required"


# --- manager restrictions -----------------------------------------------------


def test_manager_cannot_create_elevated_role() -> None:
    for role in ("manager", "org_admin", "owner"):
        resp = client.post(
            "/members",
            json={"email": "x@carswash-test.com", "role": role, "car_wash_id": str(IDS["cw_a1"])},
            headers=_headers(IDS["manager_a"]),
        )
        assert resp.status_code == 403
        assert resp.json()["detail"]["code"] in {
            "members.forbidden_role",
            "members.forbidden_scope",
        }


def test_manager_cannot_target_another_car_wash() -> None:
    resp = client.post(
        "/members",
        json={"email": "y@carswash-test.com", "role": "washer", "car_wash_id": str(IDS["cw_a2"])},
        headers=_headers(IDS["manager_a"]),
    )
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "members.forbidden_scope"


def test_manager_cannot_modify_washer_at_other_car_wash() -> None:
    resp = client.patch(
        f"/members/{IDS['m_washer2']}",
        json={"role": "washer", "car_wash_id": str(IDS["cw_a2"])},
        headers=_headers(IDS["manager_a"]),
    )
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "members.forbidden_scope"


# --- change role / scope ------------------------------------------------------


def test_org_admin_changes_role() -> None:
    resp = client.patch(
        f"/members/{IDS['m_washer1']}",
        json={"role": "manager", "car_wash_id": str(IDS["cw_a1"])},
        headers=_headers(IDS["admin_a"]),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["role"] == "manager"
    # revert so later assertions about washer1 still hold
    client.patch(
        f"/members/{IDS['m_washer1']}",
        json={"role": "washer", "car_wash_id": str(IDS["cw_a1"])},
        headers=_headers(IDS["admin_a"]),
    )


def test_change_role_on_foreign_org_is_not_found() -> None:
    resp = client.patch(
        f"/members/{IDS['m_owner_b']}",
        json={"role": "manager", "car_wash_id": str(IDS["cw_a1"])},
        headers=_headers(IDS["admin_a"]),
    )
    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "members.not_found"


# --- remove -------------------------------------------------------------------


def test_cannot_remove_self() -> None:
    resp = client.delete(f"/members/{IDS['m_admin']}", headers=_headers(IDS["admin_a"]))
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "members.cannot_remove_self"


def test_manager_removes_washer_in_own_wash() -> None:
    resp = client.delete(f"/members/{IDS['m_washer3']}", headers=_headers(IDS["manager_a"]))
    assert resp.status_code == 204


def test_org_admin_removes_member() -> None:
    resp = client.delete(f"/members/{IDS['m_washer2']}", headers=_headers(IDS["admin_a"]))
    assert resp.status_code == 204
    # the auth user survives a membership removal
    resp = client.get("/members", headers=_headers(IDS["admin_a"]))
    emails = {m["email"] for m in resp.json()}
    assert "washer2@carswash-test.com" not in emails
