"""Phase 3a: tenant isolation + capability gating for catalog/pricing/boxes/shifts.

Builds two isolated organizations (A with two car washes, B with one) plus an
owner and a washer, then drives the real endpoints with minted HS256 tokens.
All data is committed (the API commits), so a module fixture sets it up and tears
it down (deleting the orgs cascades everything). Skipped without a DB / JWT secret.
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

_db_ready = bool(settings.postgres_url and settings.supabase_jwt_secret)
pytestmark = pytest.mark.skipif(
    not _db_ready,
    reason="no database / JWT secret configured (set POSTGRES_URL + SUPABASE_JWT_SECRET)",
)

NS = uuid.UUID("00000000-0000-0000-0000-0000000003a0")


def _id(*parts: str) -> uuid.UUID:
    return uuid.uuid5(NS, "/".join(parts))


IDS = {
    "org_a": _id("org", "a"),
    "org_b": _id("org", "b"),
    "cw_a1": _id("cw", "a1"),
    "cw_a2": _id("cw", "a2"),
    "cw_b1": _id("cw", "b1"),
    "owner_a": _id("user", "owner_a"),
    "washer_a": _id("user", "washer_a"),
    "owner_b": _id("user", "owner_b"),
    "ct_a": _id("ct", "a"),
    "ct_b": _id("ct", "b"),
    "svc_a": _id("svc", "a"),
}


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
        sa.text("DELETE FROM auth.users WHERE id IN (:o, :w, :ob)"),
        {"o": IDS["owner_a"], "w": IDS["washer_a"], "ob": IDS["owner_b"]},
    )


def _setup(conn: sa.Connection) -> None:
    _teardown(conn)  # clean any leftovers from a prior interrupted run
    conn.execute(
        sa.text("INSERT INTO auth.users (id) VALUES (:o), (:w), (:ob)"),
        {"o": IDS["owner_a"], "w": IDS["washer_a"], "ob": IDS["owner_b"]},
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
            "INSERT INTO memberships (user_id, organization_id, car_wash_id, role) VALUES"
            " (:o, :a, NULL, 'owner'::membership_role),"
            " (:w, :a, :a1, 'washer'::membership_role),"
            " (:ob, :b, NULL, 'owner'::membership_role)"
        ),
        {
            "o": IDS["owner_a"],
            "w": IDS["washer_a"],
            "ob": IDS["owner_b"],
            "a": IDS["org_a"],
            "b": IDS["org_b"],
            "a1": IDS["cw_a1"],
        },
    )
    conn.execute(
        sa.text(
            "INSERT INTO car_types (id, organization_id, name) VALUES"
            " (:cta, :a, 'Sedan A'), (:ctb, :b, 'Sedan B')"
        ),
        {"cta": IDS["ct_a"], "ctb": IDS["ct_b"], "a": IDS["org_a"], "b": IDS["org_b"]},
    )
    conn.execute(
        sa.text("INSERT INTO services (id, organization_id, name) VALUES (:s, :a, 'Body wash')"),
        {"s": IDS["svc_a"], "a": IDS["org_a"]},
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


def _token(sub: uuid.UUID) -> str:
    now = int(time.time())
    payload = {"sub": str(sub), "aud": "authenticated", "iat": now, "exp": now + 3600}
    return jwt.encode(payload, settings.supabase_jwt_secret or "", algorithm="HS256")


def _headers(sub: uuid.UUID, car_wash_id: uuid.UUID | None = None) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {_token(sub)}"}
    if car_wash_id is not None:
        headers["X-Car-Wash-Id"] = str(car_wash_id)
    return headers


# --- tenant isolation ---------------------------------------------------------


def test_catalog_list_is_org_scoped() -> None:
    resp = client.get("/car-types", headers=_headers(IDS["owner_a"]))
    assert resp.status_code == 200
    names = {ct["name"] for ct in resp.json()}
    assert "Sedan A" in names
    assert "Sedan B" not in names


def test_cannot_mutate_other_orgs_catalog() -> None:
    resp = client.patch(
        f"/car-types/{IDS['ct_b']}", json={"name": "hacked"}, headers=_headers(IDS["owner_a"])
    )
    assert resp.status_code == 404
    resp = client.post(f"/car-types/{IDS['ct_b']}/archive", headers=_headers(IDS["owner_a"]))
    assert resp.status_code == 404


def test_cannot_target_inaccessible_car_wash() -> None:
    # owner A has no access to org B's car wash.
    resp = client.get("/boxes", headers=_headers(IDS["owner_a"], IDS["cw_b1"]))
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "tenant.car_wash_forbidden"


def test_pricing_rejects_foreign_catalog_refs() -> None:
    resp = client.put(
        "/service-prices",
        json={
            "service_id": str(IDS["svc_a"]),
            "car_type_id": str(IDS["ct_b"]),
            "amount_minor": 1000,
        },
        headers=_headers(IDS["owner_a"], IDS["cw_a1"]),
    )
    assert resp.status_code == 404


# --- capability gating --------------------------------------------------------


def test_washer_cannot_manage_catalog() -> None:
    resp = client.post("/car-types", json={"name": "Nope"}, headers=_headers(IDS["washer_a"]))
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "auth.forbidden"


def test_washer_cannot_manage_boxes_or_pricing_or_shifts() -> None:
    h = _headers(IDS["washer_a"], IDS["cw_a1"])
    assert client.post("/boxes", json={"name": "B"}, headers=h).status_code == 403
    assert (
        client.put(
            "/service-prices",
            json={
                "service_id": str(IDS["svc_a"]),
                "car_type_id": str(IDS["ct_a"]),
                "amount_minor": 1000,
            },
            headers=h,
        ).status_code
        == 403
    )
    assert (
        client.post("/shifts/open", json={"opening_float_minor": 0}, headers=h).status_code == 403
    )


def test_washer_can_read() -> None:
    assert client.get("/car-types", headers=_headers(IDS["washer_a"])).status_code == 200
    assert client.get("/boxes", headers=_headers(IDS["washer_a"], IDS["cw_a1"])).status_code == 200


def test_owner_can_manage_catalog_and_boxes() -> None:
    resp = client.post("/car-types", json={"name": "SUV A"}, headers=_headers(IDS["owner_a"]))
    assert resp.status_code == 200
    resp = client.post(
        "/boxes", json={"name": "Bay 1"}, headers=_headers(IDS["owner_a"], IDS["cw_a1"])
    )
    assert resp.status_code == 200
    assert resp.json()["car_wash_id"] == str(IDS["cw_a1"])


# --- price matrix round-trip + archive ----------------------------------------


def test_service_price_upsert_round_trips() -> None:
    h = _headers(IDS["owner_a"], IDS["cw_a1"])
    body = {"service_id": str(IDS["svc_a"]), "car_type_id": str(IDS["ct_a"]), "amount_minor": 50000}
    assert client.put("/service-prices", json=body, headers=h).json()["amount_minor"] == 50000

    listed = client.get("/service-prices", headers=h).json()
    match = [
        p
        for p in listed
        if p["service_id"] == str(IDS["svc_a"]) and p["car_type_id"] == str(IDS["ct_a"])
    ]
    assert len(match) == 1 and match[0]["amount_minor"] == 50000

    body["amount_minor"] = 70000
    assert client.put("/service-prices", json=body, headers=h).json()["amount_minor"] == 70000
    listed = client.get("/service-prices", headers=h).json()
    match = [p for p in listed if p["service_id"] == str(IDS["svc_a"])]
    assert len(match) == 1 and match[0]["amount_minor"] == 70000  # updated, not duplicated


def test_archive_hides_without_deleting() -> None:
    created = client.post(
        "/car-types", json={"name": "Archivable"}, headers=_headers(IDS["owner_a"])
    ).json()
    ct_id = created["id"]

    client.post(f"/car-types/{ct_id}/archive", headers=_headers(IDS["owner_a"]))

    default = client.get("/car-types", headers=_headers(IDS["owner_a"])).json()
    assert ct_id not in {c["id"] for c in default}

    with_inactive = client.get(
        "/car-types?include_inactive=true", headers=_headers(IDS["owner_a"])
    ).json()
    assert ct_id in {c["id"] for c in with_inactive}


# --- single open shift --------------------------------------------------------


def test_second_open_shift_conflicts() -> None:
    h = _headers(IDS["owner_a"], IDS["cw_a2"])  # A2 starts with no open shift
    first = client.post("/shifts/open", json={"opening_float_minor": 100000}, headers=h)
    assert first.status_code == 200

    current = client.get("/shifts/current", headers=h)
    assert current.status_code == 200 and current.json()["opening_float_minor"] == 100000

    second = client.post("/shifts/open", json={"opening_float_minor": 0}, headers=h)
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "shift.already_open"
