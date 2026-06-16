"""Idempotent development seed.

Seeds one organization, two car washes (distinct IANA timezones), car types,
services, per-car-wash service/package prices, packages, and boxes. It does NOT
seed profiles/memberships/users — those bind to Supabase ``auth.users`` and are
seeded in Phase 2.

Idempotency: every row uses a deterministic UUID (uuid5), inserted with
ON CONFLICT DO NOTHING, so re-running neither duplicates nor errors.

Run:  uv run --directory apps/api python -m scripts.seed
"""

from __future__ import annotations

import uuid
from typing import Any

import sqlalchemy as sa
from sqlalchemy import Table
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config import settings
from app.models import (
    Box,
    CarType,
    CarWash,
    Organization,
    Package,
    PackagePrice,
    PackageService,
    Service,
    ServicePrice,
)

# Stable namespace so generated UUIDs are reproducible across runs/machines.
NS = uuid.UUID("00000000-0000-0000-0000-00000000ca59")


def sid(*parts: str) -> uuid.UUID:
    """Deterministic UUID for a seed row, keyed by a logical path."""
    return uuid.uuid5(NS, "/".join(parts))


def _sync_url() -> str:
    raw = settings.postgres_url_non_pooling
    if not raw:
        raise RuntimeError("POSTGRES_URL_NON_POOLING is not configured")
    scheme, _, rest = raw.partition("://")
    url = f"postgresql+psycopg://{rest}"
    if "sslmode=" not in url:
        url += ("&" if "?" in url else "?") + "sslmode=require"
    return url


def _upsert(conn: sa.Connection, table: Table, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    stmt = pg_insert(table).values(rows)
    conn.execute(stmt.on_conflict_do_nothing(index_elements=["id"]))


def build_rows() -> dict[Table, list[dict[str, Any]]]:
    org_id = sid("org", "shiny")
    cw_ids = {"almaty": sid("cw", "almaty"), "aqtobe": sid("cw", "aqtobe")}
    car_types = {"sedan": sid("ct", "sedan"), "suv": sid("ct", "suv")}
    services = {"body_wash": sid("svc", "body_wash"), "wax": sid("svc", "wax")}
    package_id = sid("pkg", "standard")

    organizations = [
        {
            "id": org_id,
            "name": "Shiny Wash Network",
            "currency": "KZT",
            "default_locale": "ru",
            "plan": "free",
        }
    ]
    car_washes = [
        {
            "id": cw_ids["almaty"],
            "organization_id": org_id,
            "name": "Almaty Central",
            "timezone": "Asia/Almaty",
            "address": "Almaty",
            "is_active": True,
        },
        {
            "id": cw_ids["aqtobe"],
            "organization_id": org_id,
            "name": "Aqtobe West",
            "timezone": "Asia/Aqtobe",
            "address": "Aqtobe",
            "is_active": True,
        },
    ]
    car_type_rows = [
        {"id": car_types["sedan"], "organization_id": org_id, "name": "Sedan", "sort": 1},
        {"id": car_types["suv"], "organization_id": org_id, "name": "SUV", "sort": 2},
    ]
    service_rows = [
        {
            "id": services["body_wash"],
            "organization_id": org_id,
            "name": "Body wash",
            "is_active": True,
        },
        {"id": services["wax"], "organization_id": org_id, "name": "Wax", "is_active": True},
    ]
    package_rows = [
        {"id": package_id, "organization_id": org_id, "name": "Standard", "is_active": True}
    ]
    package_service_rows = [
        {
            "id": sid("pkgsvc", "standard", svc),
            "package_id": package_id,
            "service_id": services[svc],
        }
        for svc in ("body_wash", "wax")
    ]

    # Base prices (minor units, KZT) by service/car type; SUV costs more.
    base_price = {
        "body_wash": {"sedan": 200000, "suv": 300000},
        "wax": {"sedan": 150000, "suv": 220000},
    }
    package_price = {"sedan": 320000, "suv": 480000}

    service_price_rows: list[dict[str, Any]] = []
    package_price_rows: list[dict[str, Any]] = []
    box_rows: list[dict[str, Any]] = []
    for cw_key, cw_id in cw_ids.items():
        for svc_key, svc_id in services.items():
            for ct_key, ct_id in car_types.items():
                service_price_rows.append(
                    {
                        "id": sid("svcprice", cw_key, svc_key, ct_key),
                        "car_wash_id": cw_id,
                        "service_id": svc_id,
                        "car_type_id": ct_id,
                        "amount_minor": base_price[svc_key][ct_key],
                    }
                )
        for ct_key, ct_id in car_types.items():
            package_price_rows.append(
                {
                    "id": sid("pkgprice", cw_key, ct_key),
                    "car_wash_id": cw_id,
                    "package_id": package_id,
                    "car_type_id": ct_id,
                    "amount_minor": package_price[ct_key],
                }
            )
        for n in (1, 2):
            box_rows.append(
                {
                    "id": sid("box", cw_key, str(n)),
                    "car_wash_id": cw_id,
                    "name": f"Box {n}",
                    "sort": n,
                }
            )

    return {
        Organization.__table__: organizations,
        CarWash.__table__: car_washes,
        CarType.__table__: car_type_rows,
        Service.__table__: service_rows,
        Package.__table__: package_rows,
        PackageService.__table__: package_service_rows,
        ServicePrice.__table__: service_price_rows,
        PackagePrice.__table__: package_price_rows,
        Box.__table__: box_rows,
    }


def main() -> None:
    engine = sa.create_engine(_sync_url(), future=True)
    rows_by_table = build_rows()
    with engine.begin() as conn:
        # Insert in FK-safe order (dict preserves insertion order).
        for table, rows in rows_by_table.items():
            _upsert(conn, table, rows)
    with engine.connect() as conn:
        counts = {
            table.name: conn.execute(sa.select(sa.func.count()).select_from(table)).scalar()
            for table in rows_by_table
        }
    engine.dispose()
    print("seed complete:", counts)


if __name__ == "__main__":
    main()
