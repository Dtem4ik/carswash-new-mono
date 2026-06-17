"""Phase 3b: order lifecycle, payments, shift reconciliation, isolation.

Reference data (org, car wash, users, car type, services, prices, boxes) is set
up once per module; each test starts from a clean operational slate (no orders,
a single freshly opened shift) so the committed-state endpoints can run in any
order. Skipped without a DB / JWT secret.
"""

from __future__ import annotations

import ssl
import time
import uuid
from collections.abc import AsyncIterator, Iterator
from concurrent.futures import ThreadPoolExecutor
from typing import Any

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

NS = uuid.UUID("00000000-0000-0000-0000-0000000003b0")


def _id(*parts: str) -> uuid.UUID:
    return uuid.uuid5(NS, "/".join(parts))


IDS = {
    "org": _id("org"),
    "org2": _id("org2"),
    "cw": _id("cw"),
    "cw2": _id("cw2"),
    "owner": _id("owner"),
    "washer": _id("washer"),
    "owner2": _id("owner2"),
    "w1": _id("w1"),
    "w2": _id("w2"),
    "w3": _id("w3"),
    "ct": _id("ct"),
    "ct2": _id("ct2"),
    "s1": _id("s1"),
    "s2": _id("s2"),
    "box": _id("box"),
    "box2": _id("box2"),
    "corp_client": _id("corp_client"),
    "corp_car": _id("corp_car"),
    "corp_cc": _id("corp_cc"),
    "shift": _id("shift"),
}

OPENING_FLOAT = 100000


def _ssl_ctx() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


async def _session_override() -> AsyncIterator[AsyncSession]:
    # A fresh engine per request: the TestClient runs each request on its own
    # event loop, so a shared engine's pooled connections would cross loops.
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
    # Operational rows first: orders.box_id and payments/cash_movements.car_wash_id
    # are RESTRICT, which would otherwise block the organization cascade delete.
    _clean_operational(conn)
    conn.execute(
        sa.text("DELETE FROM organizations WHERE id IN (:a, :b)"),
        {"a": IDS["org"], "b": IDS["org2"]},
    )
    conn.execute(
        sa.text("DELETE FROM auth.users WHERE id = ANY(:ids)"),
        {"ids": [IDS[k] for k in ("owner", "washer", "owner2", "w1", "w2", "w3")]},
    )


def _setup(conn: sa.Connection) -> None:
    _teardown(conn)
    conn.execute(
        sa.text("INSERT INTO auth.users (id) SELECT unnest(CAST(:ids AS uuid[]))"),
        {"ids": [IDS[k] for k in ("owner", "washer", "owner2", "w1", "w2", "w3")]},
    )
    conn.execute(
        sa.text(
            "INSERT INTO organizations (id, name, default_currency, default_locale) VALUES"
            " (:a, 'Org', 'KZT', 'ru'), (:b, 'Org2', 'KZT', 'ru')"
        ),
        {"a": IDS["org"], "b": IDS["org2"]},
    )
    conn.execute(
        sa.text(
            "INSERT INTO car_washes (id, organization_id, name, timezone, currency) VALUES"
            " (:cw, :a, 'CW', 'Asia/Almaty', 'KZT'), (:cw2, :b, 'CW2', 'Asia/Almaty', 'KZT')"
        ),
        {"cw": IDS["cw"], "cw2": IDS["cw2"], "a": IDS["org"], "b": IDS["org2"]},
    )
    conn.execute(
        sa.text(
            "INSERT INTO memberships (user_id, organization_id, car_wash_id, role) VALUES"
            " (:o, :a, NULL, 'owner'::membership_role),"
            " (:w, :a, :cw, 'washer'::membership_role),"
            " (:o2, :b, NULL, 'owner'::membership_role)"
        ),
        {
            "o": IDS["owner"],
            "w": IDS["washer"],
            "o2": IDS["owner2"],
            "a": IDS["org"],
            "b": IDS["org2"],
            "cw": IDS["cw"],
        },
    )
    conn.execute(
        sa.text(
            "INSERT INTO car_types (id, organization_id, name) VALUES"
            " (:ct, :a, 'Sedan'), (:ct2, :b, 'Sedan2')"
        ),
        {"ct": IDS["ct"], "ct2": IDS["ct2"], "a": IDS["org"], "b": IDS["org2"]},
    )
    conn.execute(
        sa.text(
            "INSERT INTO services (id, organization_id, name) VALUES"
            " (:s1, :a, 'Wash'), (:s2, :a, 'Wax')"
        ),
        {"s1": IDS["s1"], "s2": IDS["s2"], "a": IDS["org"]},
    )
    conn.execute(
        sa.text(
            "INSERT INTO service_prices (car_wash_id, service_id, car_type_id, amount_minor) VALUES"
            " (:cw, :s1, :ct, 30000), (:cw, :s2, :ct, 20000)"
        ),
        {"cw": IDS["cw"], "s1": IDS["s1"], "s2": IDS["s2"], "ct": IDS["ct"]},
    )
    conn.execute(
        sa.text(
            "INSERT INTO boxes (id, car_wash_id, name, sort) VALUES"
            " (:b, :cw, 'B1', 1), (:b2, :cw, 'B2', 2)"
        ),
        {"b": IDS["box"], "b2": IDS["box2"], "cw": IDS["cw"]},
    )
    # A corporate client (postpaid) + car + link for the credit-status test.
    conn.execute(
        sa.text(
            "INSERT INTO clients (id, organization_id, name, kind) VALUES"
            " (:id, :a, 'Acme Taxi', 'corporate'::client_kind)"
        ),
        {"id": IDS["corp_client"], "a": IDS["org"]},
    )
    conn.execute(
        sa.text(
            "INSERT INTO cars (id, organization_id, plate, car_type_id) VALUES"
            " (:id, :a, 'CORP 1', :ct)"
        ),
        {"id": IDS["corp_car"], "a": IDS["org"], "ct": IDS["ct"]},
    )
    conn.execute(
        sa.text("INSERT INTO client_cars (id, client_id, car_id) VALUES (:id, :cl, :car)"),
        {"id": IDS["corp_cc"], "cl": IDS["corp_client"], "car": IDS["corp_car"]},
    )


def _clean_operational(conn: sa.Connection) -> None:
    cws = [IDS["cw"], IDS["cw2"]]
    conn.execute(sa.text("DELETE FROM orders WHERE car_wash_id = ANY(:cws)"), {"cws": cws})
    conn.execute(sa.text("DELETE FROM shifts WHERE car_wash_id = ANY(:cws)"), {"cws": cws})
    conn.execute(
        sa.text("DELETE FROM car_wash_order_counters WHERE car_wash_id = ANY(:cws)"), {"cws": cws}
    )
    # Reset box state: the deleted orders leave boxes busy with a stale pointer.
    conn.execute(
        sa.text(
            "UPDATE boxes SET status = 'free'::box_status, active_order_id = NULL"
            " WHERE car_wash_id = ANY(:cws)"
        ),
        {"cws": cws},
    )


@pytest.fixture(scope="module", autouse=True)
def _module_fixtures() -> Iterator[None]:
    engine = _sync_engine()
    with engine.begin() as conn:
        _setup(conn)
    yield
    with engine.begin() as conn:
        _clean_operational(conn)
        _teardown(conn)
    engine.dispose()


@pytest.fixture(autouse=True)
def _clean_shift() -> Iterator[None]:
    """Start each test from no orders and one freshly opened shift on CW."""
    engine = _sync_engine()
    with engine.begin() as conn:
        _clean_operational(conn)
        conn.execute(
            sa.text(
                "INSERT INTO shifts (id, car_wash_id, opened_by, opening_float_minor)"
                " VALUES (:id, :cw, :o, :f)"
            ),
            {"id": IDS["shift"], "cw": IDS["cw"], "o": IDS["owner"], "f": OPENING_FLOAT},
        )
    engine.dispose()
    yield


def _token(sub: uuid.UUID) -> str:
    now = int(time.time())
    payload = {"sub": str(sub), "aud": "authenticated", "iat": now, "exp": now + 3600}
    return jwt.encode(payload, settings.supabase_jwt_secret or "", algorithm="HS256")


def _h(sub: uuid.UUID, car_wash_id: uuid.UUID = IDS["cw"]) -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(sub)}", "X-Car-Wash-Id": str(car_wash_id)}


def _owner() -> dict[str, str]:
    return _h(IDS["owner"])


def _create_order(headers: dict[str, str], **body: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {"car_type_id": str(IDS["ct"]), "box_id": str(IDS["box"])}
    payload.update(body)
    resp = client.post("/orders", json=payload, headers=headers)
    return {"status_code": resp.status_code, "json": resp.json()}


# --- create -------------------------------------------------------------------


def test_create_walkin_in_progress_when_box_free() -> None:
    res = _create_order(
        _owner(),
        intake={"plate": "123 ABC"},
        services=[{"service_id": str(IDS["s1"]), "qty": 1}],
    )
    assert res["status_code"] == 200, res["json"]
    body = res["json"]
    assert body["client_car_id"] is None and body["plate"] == "123 ABC"
    assert body["status"] == "in_progress"
    assert body["subtotal_minor"] == 30000 and body["total_minor"] == 30000
    assert body["currency"] == "KZT"


def test_create_registered_upserts_client_and_car() -> None:
    res = _create_order(
        _owner(),
        intake={
            "plate": "REG 1",
            "client_name": "Bob",
            "client_phone": "+77001234567",
            "client_kind": "regular",
        },
        services=[{"service_id": str(IDS["s1"]), "qty": 1}],
    )
    assert res["status_code"] == 200, res["json"]
    assert res["json"]["client_car_id"] is not None


def test_subtotal_discount_total_math() -> None:
    res = _create_order(
        _owner(),
        intake={"plate": "MATH 1"},
        services=[
            {"service_id": str(IDS["s1"]), "qty": 2},
            {"service_id": str(IDS["s2"]), "qty": 1},
        ],
        discount={"amount_minor": 5000, "type": "manual"},
    )
    body = res["json"]
    assert body["subtotal_minor"] == 80000  # 30000*2 + 20000
    assert body["discount_amount_minor"] == 5000
    assert body["total_minor"] == 75000


def test_discount_cannot_exceed_subtotal() -> None:
    res = _create_order(
        _owner(),
        intake={"plate": "BAD 1"},
        services=[{"service_id": str(IDS["s1"]), "qty": 1}],
        discount={"amount_minor": 999999, "type": "manual"},
    )
    assert res["status_code"] == 400
    assert res["json"]["detail"]["code"] == "discount.exceeds_subtotal"


def test_numbers_are_monotonic_and_gap_free() -> None:
    numbers = []
    for i in range(3):
        res = _create_order(
            _owner(),
            intake={"plate": f"NUM {i}"},
            box_id=str(IDS["box2"]) if i else str(IDS["box"]),
            services=[{"service_id": str(IDS["s1"]), "qty": 1}],
        )
        numbers.append(res["json"]["number"])
    assert numbers == [1, 2, 3]


def test_busy_box_queues_second_order() -> None:
    first = _create_order(
        _owner(), intake={"plate": "Q1"}, services=[{"service_id": str(IDS["s1"]), "qty": 1}]
    )
    assert first["json"]["status"] == "in_progress"
    second = _create_order(
        _owner(), intake={"plate": "Q2"}, services=[{"service_id": str(IDS["s1"]), "qty": 1}]
    )
    assert second["json"]["status"] == "queued"


def test_create_requires_open_shift() -> None:
    engine = _sync_engine()
    with engine.begin() as conn:
        conn.execute(sa.text("DELETE FROM shifts WHERE car_wash_id = :cw"), {"cw": IDS["cw"]})
    engine.dispose()
    res = _create_order(
        _owner(), intake={"plate": "NS 1"}, services=[{"service_id": str(IDS["s1"]), "qty": 1}]
    )
    assert res["status_code"] == 400
    assert res["json"]["detail"]["code"] == "shift.not_open"


def test_washers_split_shares_equally() -> None:
    res = _create_order(
        _owner(),
        intake={"plate": "WSH 1"},
        services=[{"service_id": str(IDS["s1"]), "qty": 1}],
        washer_user_ids=[str(IDS["w1"]), str(IDS["w2"]), str(IDS["w3"])],
    )
    detail = client.get(f"/orders/{res['json']['id']}", headers=_owner()).json()
    shares = sorted(w["share_bps"] for w in detail["washers"])
    assert shares == [3333, 3333, 3334] and sum(shares) == 10000


# --- close / cancel -----------------------------------------------------------


def test_close_sets_done_and_promotes_queue() -> None:
    first = _create_order(
        _owner(), intake={"plate": "P1"}, services=[{"service_id": str(IDS["s1"]), "qty": 1}]
    )
    second = _create_order(
        _owner(), intake={"plate": "P2"}, services=[{"service_id": str(IDS["s1"]), "qty": 1}]
    )
    assert second["json"]["status"] == "queued"

    closed = client.post(f"/orders/{first['json']['id']}/close", headers=_owner()).json()
    assert closed["status"] == "done" and closed["finished_by"] == str(IDS["owner"])

    promoted = client.get(f"/orders/{second['json']['id']}", headers=_owner()).json()
    assert promoted["status"] == "in_progress"

    # Closing the promoted order frees the box (queue empty).
    client.post(f"/orders/{second['json']['id']}/close", headers=_owner())
    boxes = client.get("/boxes", headers=_owner()).json()
    box = next(b for b in boxes if b["id"] == str(IDS["box"]))
    assert box["status"] == "free" and box["active_order_id"] is None


def test_cancel_in_progress_promotes_queue() -> None:
    first = _create_order(
        _owner(), intake={"plate": "C1"}, services=[{"service_id": str(IDS["s1"]), "qty": 1}]
    )
    second = _create_order(
        _owner(), intake={"plate": "C2"}, services=[{"service_id": str(IDS["s1"]), "qty": 1}]
    )
    cancelled = client.post(f"/orders/{first['json']['id']}/cancel", headers=_owner()).json()
    assert cancelled["status"] == "cancelled"
    promoted = client.get(f"/orders/{second['json']['id']}", headers=_owner()).json()
    assert promoted["status"] == "in_progress"


# --- payments -----------------------------------------------------------------


def test_payment_status_progression() -> None:
    order = _create_order(
        _owner(), intake={"plate": "PAY 1"}, services=[{"service_id": str(IDS["s1"]), "qty": 1}]
    )["json"]
    oid = order["id"]
    assert order["payment_status"] == "unpaid"

    client.post(
        f"/orders/{oid}/payments",
        json={"method": "cash", "amount_minor": 10000},
        headers=_owner(),
    )
    assert client.get(f"/orders/{oid}", headers=_owner()).json()["payment_status"] == "partial"

    client.post(
        f"/orders/{oid}/payments",
        json={"method": "card", "amount_minor": 20000},
        headers=_owner(),
    )
    detail = client.get(f"/orders/{oid}", headers=_owner()).json()
    assert detail["payment_status"] == "paid"
    assert detail["paid_total_minor"] == 30000 and detail["balance_minor"] == 0

    client.post(
        f"/orders/{oid}/payments",
        json={"method": "cash", "kind": "refund", "amount_minor": 30000},
        headers=_owner(),
    )
    assert client.get(f"/orders/{oid}", headers=_owner()).json()["payment_status"] == "refunded"


def test_corporate_order_is_credit() -> None:
    res = _create_order(
        _owner(),
        client_car_id=str(IDS["corp_cc"]),
        services=[{"service_id": str(IDS["s1"]), "qty": 1}],
    )
    assert res["status_code"] == 200, res["json"]
    assert res["json"]["payment_status"] == "credit"


# --- shift close / reconciliation ---------------------------------------------


def test_shift_close_blocked_by_open_orders() -> None:
    _create_order(
        _owner(), intake={"plate": "OPEN 1"}, services=[{"service_id": str(IDS["s1"]), "qty": 1}]
    )
    resp = client.post("/shifts/close", json={"counted_cash_minor": 0}, headers=_owner())
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "shift.has_open_orders"


def test_shift_reconciliation_math() -> None:
    order = _create_order(
        _owner(), intake={"plate": "REC 1"}, services=[{"service_id": str(IDS["s1"]), "qty": 1}]
    )["json"]
    client.post(
        f"/orders/{order['id']}/payments",
        json={"method": "cash", "amount_minor": 50000},
        headers=_owner(),
    )
    client.post(
        "/shifts/current/cash-movements",
        json={"type": "expense", "amount_minor": 20000, "reason": "chemicals"},
        headers=_owner(),
    )
    client.post(
        "/shifts/current/cash-movements",
        json={"type": "deposit", "amount_minor": 5000},
        headers=_owner(),
    )
    client.post(f"/orders/{order['id']}/close", headers=_owner())

    # expected = 100000 float + 50000 cash - 20000 expense + 5000 deposit = 135000
    resp = client.post("/shifts/close", json={"counted_cash_minor": 130000}, headers=_owner())
    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert body["expected_minor"] == 135000
    assert body["counted_minor"] == 130000
    assert body["variance_minor"] == -5000


# --- concurrency --------------------------------------------------------------


def test_concurrent_creates_get_distinct_numbers() -> None:
    def submit(i: int) -> int:
        res = _create_order(
            _owner(),
            intake={"plate": f"CONC {i}"},
            box_id=str(IDS["box2"]),
            services=[{"service_id": str(IDS["s1"]), "qty": 1}],
        )
        return int(res["json"]["number"])

    with ThreadPoolExecutor(max_workers=4) as pool:
        numbers = list(pool.map(submit, range(4)))

    assert len(set(numbers)) == 4  # all distinct, no duplicate under concurrency
    assert sorted(numbers) == [1, 2, 3, 4]


# --- tenant isolation ---------------------------------------------------------


def test_cannot_access_order_outside_accessible_car_washes() -> None:
    order = _create_order(
        _owner(), intake={"plate": "ISO 1"}, services=[{"service_id": str(IDS["s1"]), "qty": 1}]
    )["json"]
    oid = order["id"]

    # owner2 has no access to CW at all → 403 from tenant resolution.
    forbidden = client.get(f"/orders/{oid}", headers=_h(IDS["owner2"], IDS["cw"]))
    assert forbidden.status_code == 403

    # Scoped to their own CW2, the CW order is simply invisible → 404.
    not_found = client.get(f"/orders/{oid}", headers=_h(IDS["owner2"], IDS["cw2"]))
    assert not_found.status_code == 404
    closed = client.post(f"/orders/{oid}/close", headers=_h(IDS["owner2"], IDS["cw2"]))
    assert closed.status_code == 404


def test_washer_is_read_only() -> None:
    order = _create_order(
        _owner(), intake={"plate": "RO 1"}, services=[{"service_id": str(IDS["s1"]), "qty": 1}]
    )["json"]
    # Read allowed within the car wash.
    assert client.get("/orders", headers=_h(IDS["washer"])).status_code == 200
    # Writes forbidden.
    assert (
        client.post(
            "/orders",
            json={
                "car_type_id": str(IDS["ct"]),
                "box_id": str(IDS["box"]),
                "intake": {"plate": "RO 2"},
                "services": [{"service_id": str(IDS["s1"]), "qty": 1}],
            },
            headers=_h(IDS["washer"]),
        ).status_code
        == 403
    )
    assert client.post(f"/orders/{order['id']}/close", headers=_h(IDS["washer"])).status_code == 403
    assert (
        client.post(
            f"/orders/{order['id']}/payments",
            json={"method": "cash", "amount_minor": 1000},
            headers=_h(IDS["washer"]),
        ).status_code
        == 403
    )
