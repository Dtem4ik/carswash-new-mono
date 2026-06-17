"""Role → capability matrix (ARCHITECTURE.md §4).

Pure, side-effect-free authorization data. Capabilities are **stable codes**, not
localized prose; the web maps them to UI affordances. Endpoints gate writes on
these via the ``require_capability`` dependency.
"""

from __future__ import annotations

from app.models.enums import MembershipRole


class Capability:
    """Stable action codes used across the API and surfaced to the web."""

    ORDERS_VIEW = "orders.view"
    ORDERS_CREATE = "orders.create"
    ORDERS_UPDATE = "orders.update"
    ORDERS_CLOSE = "orders.close"
    ORDERS_CANCEL = "orders.cancel"
    PAYMENTS_RECORD = "payments.record"
    PRICING_VIEW = "pricing.view"
    PRICING_EDIT = "pricing.edit"
    CATALOG_MANAGE = "catalog.manage"
    BOXES_MANAGE = "boxes.manage"
    SHIFTS_MANAGE = "shifts.manage"
    SHIFTS_OPEN = "shifts.open"
    SHIFTS_CLOSE = "shifts.close"
    CASH_MANAGE = "cash.manage"
    CASH_RECORD = "cash.record"
    CLIENTS_MANAGE = "clients.manage"
    REPORTS_VIEW = "reports.view"
    USERS_MANAGE = "users.manage"
    CAR_WASH_MANAGE = "car_wash.manage"


# A washer is read-only operationally for the web MVP: they can see their car
# wash's orders but do not create/close them or touch money.
_WASHER: frozenset[str] = frozenset({Capability.ORDERS_VIEW})

# A manager runs a location end to end: orders, payments, pricing, shifts, cash.
_MANAGER: frozenset[str] = _WASHER | frozenset(
    {
        Capability.ORDERS_CREATE,
        Capability.ORDERS_UPDATE,
        Capability.ORDERS_CLOSE,
        Capability.ORDERS_CANCEL,
        Capability.PAYMENTS_RECORD,
        Capability.PRICING_VIEW,
        Capability.PRICING_EDIT,
        Capability.CATALOG_MANAGE,
        Capability.BOXES_MANAGE,
        Capability.SHIFTS_MANAGE,
        Capability.SHIFTS_OPEN,
        Capability.SHIFTS_CLOSE,
        Capability.CASH_MANAGE,
        Capability.CASH_RECORD,
        Capability.CLIENTS_MANAGE,
        Capability.REPORTS_VIEW,
    }
)

# Org admins additionally manage memberships and car washes across the org.
_ORG_ADMIN: frozenset[str] = _MANAGER | frozenset(
    {Capability.USERS_MANAGE, Capability.CAR_WASH_MANAGE}
)

# Owner has the full set (org admin + everything reserved for ownership today).
_OWNER: frozenset[str] = _ORG_ADMIN

_MATRIX: dict[MembershipRole, frozenset[str]] = {
    MembershipRole.owner: _OWNER,
    MembershipRole.org_admin: _ORG_ADMIN,
    MembershipRole.manager: _MANAGER,
    MembershipRole.washer: _WASHER,
}


def capabilities_for(role: MembershipRole) -> frozenset[str]:
    """All capability codes granted to ``role``."""
    return _MATRIX[role]


def can(role: MembershipRole, action: str) -> bool:
    """Whether ``role`` may perform ``action``."""
    return action in _MATRIX[role]
