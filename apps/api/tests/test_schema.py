"""Phase 1.5 schema refinements: dedup, washer links, and updated_at.

All fixtures are created inside a transaction that is rolled back, so nothing
persists. Skipped when no database is configured (e.g. CI without secrets).
"""

from __future__ import annotations

import uuid

import pytest
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError

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


def _engine() -> sa.Engine:
    return sa.create_engine(_sync_url(), future=True)


def _make_org(conn: sa.Connection, name: str = "Org") -> uuid.UUID:
    org = uuid.uuid4()
    conn.execute(
        sa.text(
            "INSERT INTO organizations (id, name, default_currency, default_locale)"
            " VALUES (:id, :n, 'KZT', 'ru')"
        ),
        {"id": org, "n": name},
    )
    return org


def _make_car_type(conn: sa.Connection, org: uuid.UUID) -> uuid.UUID:
    ct = uuid.uuid4()
    conn.execute(
        sa.text("INSERT INTO car_types (id, organization_id, name) VALUES (:id, :org, 'Sedan')"),
        {"id": ct, "org": org},
    )
    return ct


def _insert_car(conn: sa.Connection, org: uuid.UUID, ct: uuid.UUID, plate: str) -> None:
    conn.execute(
        sa.text(
            "INSERT INTO cars (id, organization_id, plate, car_type_id)"
            " VALUES (:id, :org, :plate, :ct)"
        ),
        {"id": uuid.uuid4(), "org": org, "plate": plate, "ct": ct},
    )


def test_car_plate_dedup_within_org_but_not_across_orgs() -> None:
    with _engine().connect() as conn:
        trans = conn.begin()
        try:
            org1 = _make_org(conn, "Org 1")
            org2 = _make_org(conn, "Org 2")
            ct1 = _make_car_type(conn, org1)
            ct2 = _make_car_type(conn, org2)

            _insert_car(conn, org1, ct1, "ABC 123")

            # Same normalized plate (uppercased, whitespace stripped) in the same
            # org is rejected by the functional unique index.
            with pytest.raises(IntegrityError), conn.begin_nested():
                _insert_car(conn, org1, ct1, "abc123")

            # The same plate in a different org is allowed.
            _insert_car(conn, org2, ct2, "ABC 123")

            count = conn.execute(sa.text("SELECT count(*) FROM cars")).scalar()
            assert count == 2
        finally:
            trans.rollback()


def test_order_washers_link_and_uniqueness() -> None:
    with _engine().connect() as conn:
        trans = conn.begin()
        try:
            u1, u2 = uuid.uuid4(), uuid.uuid4()
            conn.execute(
                sa.text("INSERT INTO auth.users (id) VALUES (:a), (:b)"), {"a": u1, "b": u2}
            )
            org = _make_org(conn)
            ct = _make_car_type(conn, org)
            cw = uuid.uuid4()
            conn.execute(
                sa.text(
                    "INSERT INTO car_washes (id, organization_id, name, timezone, currency)"
                    " VALUES (:id, :org, 'CW', 'Asia/Almaty', 'KZT')"
                ),
                {"id": cw, "org": org},
            )
            box, shift, client, car, cc, order = (uuid.uuid4() for _ in range(6))
            conn.execute(
                sa.text("INSERT INTO boxes (id, car_wash_id, name) VALUES (:id, :cw, 'B1')"),
                {"id": box, "cw": cw},
            )
            conn.execute(
                sa.text("INSERT INTO shifts (id, car_wash_id, opened_by) VALUES (:id, :cw, :u)"),
                {"id": shift, "cw": cw, "u": u1},
            )
            conn.execute(
                sa.text("INSERT INTO clients (id, organization_id, name) VALUES (:id, :org, 'C')"),
                {"id": client, "org": org},
            )
            conn.execute(
                sa.text(
                    "INSERT INTO cars (id, organization_id, plate, car_type_id)"
                    " VALUES (:id, :org, 'PLATE', :ct)"
                ),
                {"id": car, "org": org, "ct": ct},
            )
            conn.execute(
                sa.text("INSERT INTO client_cars (id, client_id, car_id) VALUES (:id, :cl, :car)"),
                {"id": cc, "cl": client, "car": car},
            )
            conn.execute(
                sa.text(
                    "INSERT INTO orders (id, car_wash_id, box_id, shift_id, client_car_id,"
                    " car_type_id, status, price_amount_minor, currency, created_by)"
                    " VALUES (:id, :cw, :box, :shift, :cc, :ct, 'queued'::order_status,"
                    " 200000, 'KZT', :u)"
                ),
                {"id": order, "cw": cw, "box": box, "shift": shift, "cc": cc, "ct": ct, "u": u1},
            )

            # Two distinct washers on one order: allowed.
            conn.execute(
                sa.text("INSERT INTO order_washers (order_id, user_id) VALUES (:o, :a), (:o, :b)"),
                {"o": order, "a": u1, "b": u2},
            )
            # Re-adding the same (order, user) pair is rejected.
            with pytest.raises(IntegrityError), conn.begin_nested():
                conn.execute(
                    sa.text("INSERT INTO order_washers (order_id, user_id) VALUES (:o, :a)"),
                    {"o": order, "a": u1},
                )

            count = conn.execute(
                sa.text("SELECT count(*) FROM order_washers WHERE order_id = :o"), {"o": order}
            ).scalar()
            assert count == 2
        finally:
            trans.rollback()


def test_updated_at_changes_on_update() -> None:
    with _engine().connect() as conn:
        trans = conn.begin()
        try:
            org = _make_org(conn)
            client = uuid.uuid4()
            conn.execute(
                sa.text(
                    "INSERT INTO clients (id, organization_id, name) VALUES (:id, :org, 'Before')"
                ),
                {"id": client, "org": org},
            )
            before = conn.execute(
                sa.text("SELECT updated_at FROM clients WHERE id = :id"), {"id": client}
            ).scalar_one()

            conn.execute(
                sa.text("UPDATE clients SET name = 'After' WHERE id = :id"), {"id": client}
            )
            after = conn.execute(
                sa.text("SELECT updated_at FROM clients WHERE id = :id"), {"id": client}
            ).scalar_one()

            assert after > before
        finally:
            trans.rollback()
