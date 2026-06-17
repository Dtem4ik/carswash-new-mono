"""Phase 1.6 data-model guarantees: till/shift integrity, cross-wash FKs, order
money invariants, payment + refund flow, and anonymous walk-ins.

All fixtures live inside a transaction that is rolled back, so nothing persists.
Skipped when no database is configured (e.g. CI without secrets).
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


def _user(conn: sa.Connection) -> uuid.UUID:
    uid = uuid.uuid4()
    conn.execute(sa.text("INSERT INTO auth.users (id) VALUES (:id)"), {"id": uid})
    return uid


def _org(conn: sa.Connection) -> uuid.UUID:
    org = uuid.uuid4()
    conn.execute(
        sa.text(
            "INSERT INTO organizations (id, name, default_currency, default_locale)"
            " VALUES (:id, 'Org', 'KZT', 'ru')"
        ),
        {"id": org},
    )
    return org


def _car_wash(conn: sa.Connection, org: uuid.UUID) -> uuid.UUID:
    cw = uuid.uuid4()
    conn.execute(
        sa.text(
            "INSERT INTO car_washes (id, organization_id, name, timezone, currency)"
            " VALUES (:id, :org, 'CW', 'Asia/Almaty', 'KZT')"
        ),
        {"id": cw, "org": org},
    )
    return cw


def _box(conn: sa.Connection, cw: uuid.UUID) -> uuid.UUID:
    box = uuid.uuid4()
    conn.execute(
        sa.text("INSERT INTO boxes (id, car_wash_id, name) VALUES (:id, :cw, 'B1')"),
        {"id": box, "cw": cw},
    )
    return box


def _shift(
    conn: sa.Connection, cw: uuid.UUID, user: uuid.UUID, *, closed: bool = False
) -> uuid.UUID:
    shift = uuid.uuid4()
    closed_at = "now()" if closed else "NULL"
    conn.execute(
        sa.text(
            "INSERT INTO shifts (id, car_wash_id, opened_by, closed_at)"
            f" VALUES (:id, :cw, :u, {closed_at})"
        ),
        {"id": shift, "cw": cw, "u": user},
    )
    return shift


def _car_type(conn: sa.Connection, org: uuid.UUID) -> uuid.UUID:
    ct = uuid.uuid4()
    conn.execute(
        sa.text("INSERT INTO car_types (id, organization_id, name) VALUES (:id, :org, 'Sedan')"),
        {"id": ct, "org": org},
    )
    return ct


def _insert_order(conn: sa.Connection, *, status: str = "queued", **cols: object) -> uuid.UUID:
    cols.setdefault("id", uuid.uuid4())
    cols.setdefault("number", 1)
    cols.setdefault("subtotal_minor", 100000)
    cols.setdefault("discount_amount_minor", 0)
    cols.setdefault("total_minor", 100000)
    cols.setdefault("currency", "KZT")
    # status is an internal enum code; inline it as a literal cast (binding a
    # param next to a ::cast confuses the text() parser).
    names = "status, " + ", ".join(cols)
    placeholders = f"'{status}'::order_status, " + ", ".join(f":{c}" for c in cols)
    conn.execute(sa.text(f"INSERT INTO orders ({names}) VALUES ({placeholders})"), cols)
    return cols["id"]  # type: ignore[return-value]


def test_single_open_shift_per_car_wash() -> None:
    with _engine().connect() as conn:
        trans = conn.begin()
        try:
            org = _org(conn)
            cw = _car_wash(conn, org)
            user = _user(conn)

            _shift(conn, cw, user)  # first open shift: OK

            # A second open shift in the same car wash is rejected.
            with pytest.raises(IntegrityError), conn.begin_nested():
                _shift(conn, cw, user)

            # Closing the first, then opening another, is allowed.
            conn.execute(
                sa.text("UPDATE shifts SET closed_at = now() WHERE car_wash_id = :cw"), {"cw": cw}
            )
            _shift(conn, cw, user)

            open_count = conn.execute(
                sa.text(
                    "SELECT count(*) FROM shifts WHERE car_wash_id = :cw AND closed_at IS NULL"
                ),
                {"cw": cw},
            ).scalar()
            assert open_count == 1
        finally:
            trans.rollback()


def test_composite_fk_blocks_cross_wash_box() -> None:
    with _engine().connect() as conn:
        trans = conn.begin()
        try:
            org = _org(conn)
            cw_a = _car_wash(conn, org)
            cw_b = _car_wash(conn, org)
            user = _user(conn)
            ct = _car_type(conn, org)
            box_a = _box(conn, cw_a)
            box_b = _box(conn, cw_b)
            shift_a = _shift(conn, cw_a, user)

            # Sanity: an order wholly within car wash A is fine.
            _insert_order(
                conn,
                car_wash_id=cw_a,
                box_id=box_a,
                shift_id=shift_a,
                car_type_id=ct,
                plate="A 001",
                created_by=user,
            )

            # An order in car wash A pointing at car wash B's box is rejected by
            # the composite (car_wash_id, box_id) -> boxes(car_wash_id, id) FK.
            with pytest.raises(IntegrityError), conn.begin_nested():
                _insert_order(
                    conn,
                    car_wash_id=cw_a,
                    box_id=box_b,
                    shift_id=shift_a,
                    car_type_id=ct,
                    number=2,
                    plate="A 002",
                    created_by=user,
                )
        finally:
            trans.rollback()


def test_order_total_must_equal_subtotal_minus_discount() -> None:
    with _engine().connect() as conn:
        trans = conn.begin()
        try:
            org = _org(conn)
            cw = _car_wash(conn, org)
            user = _user(conn)
            ct = _car_type(conn, org)
            box = _box(conn, cw)
            shift = _shift(conn, cw, user)

            # Inconsistent breakdown (1000 - 200 != 900) is rejected.
            with pytest.raises(IntegrityError), conn.begin_nested():
                _insert_order(
                    conn,
                    car_wash_id=cw,
                    box_id=box,
                    shift_id=shift,
                    car_type_id=ct,
                    plate="A 1",
                    created_by=user,
                    subtotal_minor=1000,
                    discount_amount_minor=200,
                    total_minor=900,
                )

            # Consistent breakdown is accepted.
            _insert_order(
                conn,
                car_wash_id=cw,
                box_id=box,
                shift_id=shift,
                car_type_id=ct,
                plate="A 1",
                created_by=user,
                subtotal_minor=1000,
                discount_amount_minor=200,
                total_minor=800,
            )
        finally:
            trans.rollback()


def test_payment_and_refund_flow() -> None:
    with _engine().connect() as conn:
        trans = conn.begin()
        try:
            org = _org(conn)
            cw = _car_wash(conn, org)
            user = _user(conn)
            ct = _car_type(conn, org)
            box = _box(conn, cw)
            shift = _shift(conn, cw, user)
            order = _insert_order(
                conn,
                car_wash_id=cw,
                box_id=box,
                shift_id=shift,
                car_type_id=ct,
                plate="A 1",
                created_by=user,
                subtotal_minor=90000,
                total_minor=90000,
            )

            def add_payment(kind: str, amount: int) -> None:
                conn.execute(
                    sa.text(
                        "INSERT INTO payments (order_id, car_wash_id, method, kind, amount_minor,"
                        " currency, received_by) VALUES (:o, :cw, 'cash'::payment_method,"
                        " CAST(:k AS payment_kind), :a, 'KZT', :u)"
                    ),
                    {"o": order, "cw": cw, "k": kind, "a": amount, "u": user},
                )

            add_payment("payment", 90000)
            conn.execute(
                sa.text("UPDATE orders SET payment_status = 'paid' WHERE id = :o"), {"o": order}
            )

            # A refund is a positive amount with kind='refund', never a negative payment.
            with pytest.raises(IntegrityError), conn.begin_nested():
                add_payment("refund", -90000)

            add_payment("refund", 90000)
            conn.execute(
                sa.text("UPDATE orders SET payment_status = 'refunded' WHERE id = :o"), {"o": order}
            )

            paid = conn.execute(
                sa.text(
                    "SELECT coalesce(sum(amount_minor) FILTER (WHERE kind = 'payment'), 0)"
                    " - coalesce(sum(amount_minor) FILTER (WHERE kind = 'refund'), 0)"
                    " FROM payments WHERE order_id = :o"
                ),
                {"o": order},
            ).scalar()
            status = conn.execute(
                sa.text("SELECT payment_status FROM orders WHERE id = :o"), {"o": order}
            ).scalar()
            assert paid == 0
            assert status == "refunded"
        finally:
            trans.rollback()


def test_walkin_order_without_client_car() -> None:
    with _engine().connect() as conn:
        trans = conn.begin()
        try:
            org = _org(conn)
            cw = _car_wash(conn, org)
            user = _user(conn)
            ct = _car_type(conn, org)
            box = _box(conn, cw)
            shift = _shift(conn, cw, user)

            # Anonymous "washed and left": no client_car, just a plate snapshot.
            order = _insert_order(
                conn,
                car_wash_id=cw,
                box_id=box,
                shift_id=shift,
                car_type_id=ct,
                client_car_id=None,
                plate="777 XYZ",
                created_by=user,
            )

            row = conn.execute(
                sa.text("SELECT client_car_id, plate FROM orders WHERE id = :o"), {"o": order}
            ).one()
            assert row.client_car_id is None
            assert row.plate == "777 XYZ"
        finally:
            trans.rollback()
