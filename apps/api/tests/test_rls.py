"""Proves tenant isolation via RLS on the realtime-exposed ``orders`` table.

A location user (washer scoped to car wash A) must see only car wash A's
orders, while an org owner sees orders from every car wash in the organization.

Runs against the configured Postgres (direct connection); all fixtures are
created inside a transaction that is rolled back, so nothing persists. Skipped
when no database is configured (e.g. CI without secrets).
"""

from __future__ import annotations

import json
import uuid

import pytest
import sqlalchemy as sa

from app.config import settings

pytestmark = pytest.mark.skipif(
    not settings.postgres_url_non_pooling,
    reason="no database configured (set POSTGRES_URL_NON_POOLING)",
)


def _sync_url() -> str:
    raw = settings.postgres_url_non_pooling or ""
    scheme, _, rest = raw.partition("://")
    url = f"postgresql+psycopg://{rest}"
    if "sslmode=" not in url:
        url += ("&" if "?" in url else "?") + "sslmode=require"
    return url


def _visible_order_car_washes(conn: sa.Connection, sub: uuid.UUID) -> set[str]:
    """car_wash_ids of orders visible to ``sub`` under the authenticated role."""
    conn.execute(sa.text("SET LOCAL ROLE authenticated"))
    conn.execute(
        sa.text("SELECT set_config('request.jwt.claims', :claims, true)"),
        {"claims": json.dumps({"sub": str(sub)})},
    )
    rows = conn.execute(sa.text("SELECT car_wash_id FROM orders")).scalars().all()
    conn.execute(sa.text("RESET ROLE"))
    return {str(r) for r in rows}


def test_rls_orders_tenant_isolation() -> None:
    ids = {
        k: uuid.uuid4()
        for k in (
            "owner",
            "washer",
            "org",
            "cwA",
            "cwB",
            "ct",
            "boxA",
            "boxB",
            "shiftA",
            "shiftB",
            "client",
            "car",
            "ccA",
            "ccB",
            "orderA",
            "orderB",
        )
    }
    engine = sa.create_engine(_sync_url(), future=True)
    with engine.connect() as conn:
        trans = conn.begin()
        try:
            conn.execute(
                sa.text("INSERT INTO auth.users (id) VALUES (:o), (:w)"),
                {"o": ids["owner"], "w": ids["washer"]},
            )
            conn.execute(
                sa.text(
                    "INSERT INTO organizations (id, name, currency, default_locale)"
                    " VALUES (:id, 'RLS Org', 'KZT', 'ru')"
                ),
                {"id": ids["org"]},
            )
            conn.execute(
                sa.text(
                    "INSERT INTO car_washes (id, organization_id, name, timezone) VALUES"
                    " (:a, :org, 'A', 'Asia/Almaty'), (:b, :org, 'B', 'Asia/Aqtobe')"
                ),
                {"a": ids["cwA"], "b": ids["cwB"], "org": ids["org"]},
            )
            # Memberships: owner (org-wide) and washer (car wash A only).
            conn.execute(
                sa.text(
                    "INSERT INTO memberships (user_id, organization_id, car_wash_id, role) VALUES"
                    " (:o, :org, NULL, 'owner'::membership_role),"
                    " (:w, :org, :a, 'washer'::membership_role)"
                ),
                {"o": ids["owner"], "w": ids["washer"], "org": ids["org"], "a": ids["cwA"]},
            )
            conn.execute(
                sa.text(
                    "INSERT INTO car_types (id, organization_id, name) VALUES (:id, :org, 'Sedan')"
                ),
                {"id": ids["ct"], "org": ids["org"]},
            )
            conn.execute(
                sa.text(
                    "INSERT INTO boxes (id, car_wash_id, name) VALUES"
                    " (:a, :cwA, 'A1'), (:b, :cwB, 'B1')"
                ),
                {"a": ids["boxA"], "b": ids["boxB"], "cwA": ids["cwA"], "cwB": ids["cwB"]},
            )
            conn.execute(
                sa.text(
                    "INSERT INTO shifts (id, car_wash_id, opened_by) VALUES"
                    " (:a, :cwA, :o), (:b, :cwB, :o)"
                ),
                {
                    "a": ids["shiftA"],
                    "b": ids["shiftB"],
                    "cwA": ids["cwA"],
                    "cwB": ids["cwB"],
                    "o": ids["owner"],
                },
            )
            conn.execute(
                sa.text("INSERT INTO clients (id, organization_id, name) VALUES (:id, :org, 'C')"),
                {"id": ids["client"], "org": ids["org"]},
            )
            conn.execute(
                sa.text("INSERT INTO cars (id, plate, car_type_id) VALUES (:id, 'PLATE', :ct)"),
                {"id": ids["car"], "ct": ids["ct"]},
            )
            conn.execute(
                sa.text(
                    "INSERT INTO client_cars (id, client_id, car_id) VALUES"
                    " (:a, :client, :car), (:b, :client, :car)"
                ),
                {"a": ids["ccA"], "b": ids["ccB"], "client": ids["client"], "car": ids["car"]},
            )
            conn.execute(
                sa.text(
                    "INSERT INTO orders (id, car_wash_id, box_id, shift_id, client_car_id, status,"
                    " price_amount_minor, currency, created_by) VALUES"
                    " (:oa, :cwA, :boxA, :shiftA, :ccA, 'queued'::order_status, 200000, 'KZT', :o),"
                    " (:ob, :cwB, :boxB, :shiftB, :ccB, 'queued'::order_status, 300000, 'KZT', :o)"
                ),
                {
                    "oa": ids["orderA"],
                    "ob": ids["orderB"],
                    "cwA": ids["cwA"],
                    "cwB": ids["cwB"],
                    "boxA": ids["boxA"],
                    "boxB": ids["boxB"],
                    "shiftA": ids["shiftA"],
                    "shiftB": ids["shiftB"],
                    "ccA": ids["ccA"],
                    "ccB": ids["ccB"],
                    "o": ids["owner"],
                },
            )

            washer_view = _visible_order_car_washes(conn, ids["washer"])
            owner_view = _visible_order_car_washes(conn, ids["owner"])

            # Washer sees only car wash A; owner sees both.
            assert washer_view == {str(ids["cwA"])}
            assert owner_view == {str(ids["cwA"]), str(ids["cwB"])}
        finally:
            trans.rollback()
    engine.dispose()
