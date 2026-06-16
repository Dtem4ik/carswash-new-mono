"""ORM models. Importing this package registers every table on ``Base.metadata``."""

from app.models import _external  # noqa: F401  (registers auth.users reference)
from app.models.base import Base
from app.models.catalog import (
    CarType,
    Package,
    PackagePrice,
    PackageService,
    Service,
    ServicePrice,
)
from app.models.enums import BoxStatus, MembershipRole, OrderStatus
from app.models.tenancy import CarWash, Membership, Organization, Profile

__all__ = [
    "Base",
    "BoxStatus",
    "MembershipRole",
    "OrderStatus",
    "Organization",
    "CarWash",
    "Profile",
    "Membership",
    "CarType",
    "Service",
    "ServicePrice",
    "Package",
    "PackageService",
    "PackagePrice",
]
