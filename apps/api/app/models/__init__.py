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
from app.models.enums import (
    BoxStatus,
    CashMovementType,
    ClientKind,
    DiscountType,
    MembershipRole,
    OrderPaymentStatus,
    OrderStatus,
    PaymentKind,
    PaymentMethod,
)
from app.models.operations import (
    Box,
    Car,
    CarWashOrderCounter,
    CashMovement,
    Client,
    ClientCar,
    Order,
    OrderService,
    OrderWasher,
    Payment,
    Shift,
)
from app.models.tenancy import CarWash, Membership, Organization, Profile

__all__ = [
    "Base",
    "BoxStatus",
    "MembershipRole",
    "OrderStatus",
    "PaymentMethod",
    "PaymentKind",
    "OrderPaymentStatus",
    "CashMovementType",
    "DiscountType",
    "ClientKind",
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
    "Box",
    "Shift",
    "Client",
    "Car",
    "ClientCar",
    "Order",
    "OrderService",
    "OrderWasher",
    "Payment",
    "CashMovement",
    "CarWashOrderCounter",
]
