"""Supabase JWT verification.

The signing algorithm is detected from the token header: asymmetric tokens
(RS*/ES*/EdDSA/PS*) are verified against the project's cached JWKS; symmetric
tokens (HS*) fall back to the shared ``SUPABASE_JWT_SECRET``. Any missing,
malformed, or expired token yields ``401`` with a stable error ``code`` (never
localized prose). Uses PyJWT (+ cryptography).
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from typing import Any

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWK

from app.config import settings

_JWKS_TTL_SECONDS = 600.0
_jwks_keys: dict[str, PyJWK] = {}
_jwks_fetched_at: float = 0.0


class AuthError(HTTPException):
    """401 with a stable ``{"code": ...}`` body and a Bearer challenge."""

    def __init__(self, code: str) -> None:
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": code},
            headers={"WWW-Authenticate": "Bearer"},
        )


@dataclass(frozen=True)
class AuthenticatedUser:
    """The verified Supabase auth user (``sub``) and the raw verified claims."""

    id: uuid.UUID
    claims: dict[str, Any]


def _jwks_url() -> str:
    base = (settings.supabase_url or "").rstrip("/")
    return f"{base}/auth/v1/.well-known/jwks.json"


async def _load_jwks(*, force: bool) -> dict[str, PyJWK]:
    """Return the JWKS keyed by ``kid``, refreshing the cache when stale."""
    global _jwks_keys, _jwks_fetched_at
    now = time.monotonic()
    if not force and _jwks_keys and (now - _jwks_fetched_at) < _JWKS_TTL_SECONDS:
        return _jwks_keys
    if not settings.supabase_url:
        raise AuthError("auth.misconfigured")
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(_jwks_url())
        resp.raise_for_status()
        data = resp.json()
    _jwks_keys = {
        key["kid"]: PyJWK.from_dict(key) for key in data.get("keys", []) if key.get("kid")
    }
    _jwks_fetched_at = now
    return _jwks_keys


async def _signing_key(token: str, kid: str | None) -> Any:
    keys = await _load_jwks(force=False)
    jwk = keys.get(kid or "")
    if jwk is None:
        # A rotated key may not be cached yet; refresh once before giving up.
        keys = await _load_jwks(force=True)
        jwk = keys.get(kid or "")
    if jwk is None:
        raise AuthError("auth.invalid_token")
    return jwk.key


async def verify_token(token: str) -> dict[str, Any]:
    """Verify a Supabase access token and return its claims, or raise ``401``."""
    try:
        header = jwt.get_unverified_header(token)
    except jwt.InvalidTokenError as exc:
        raise AuthError("auth.invalid_token") from exc

    alg = str(header.get("alg", ""))
    try:
        if alg.startswith("HS"):
            if not settings.supabase_jwt_secret:
                raise AuthError("auth.misconfigured")
            key: Any = settings.supabase_jwt_secret
        else:
            key = await _signing_key(token, header.get("kid"))
        return jwt.decode(
            token,
            key=key,
            algorithms=[alg],
            audience=settings.supabase_jwt_audience,
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise AuthError("auth.expired_token") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthError("auth.invalid_token") from exc


_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> AuthenticatedUser:
    """FastAPI dependency: require and verify a Bearer token, return the user."""
    if credentials is None or not credentials.credentials:
        raise AuthError("auth.missing_token")
    claims = await verify_token(credentials.credentials)
    try:
        user_id = uuid.UUID(str(claims["sub"]))
    except (KeyError, ValueError) as exc:
        raise AuthError("auth.invalid_token") from exc
    return AuthenticatedUser(id=user_id, claims=claims)
