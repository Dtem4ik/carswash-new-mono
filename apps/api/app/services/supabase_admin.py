"""Thin async wrapper over the Supabase (GoTrue) admin API.

Server-side only: it uses the **service role key**, which never reaches the web.
Used to provision auth users when inviting staff. The matching ``profiles`` row
is created by the DB trigger; the caller creates the ``memberships`` row.

The key and project URL come from the environment (see ``app/config.py``); when
either is missing — CI, local without secrets — ``admin_configured`` is False
and callers surface ``members.admin_unavailable`` instead of crashing.
"""

from __future__ import annotations

import secrets

import httpx

from app.config import settings

_TIMEOUT = 15.0
_MAX_PAGES = 50
_PER_PAGE = 200


class SupabaseAdminError(RuntimeError):
    """The admin API was reachable but returned an unexpected status."""


def admin_configured() -> bool:
    """Whether the Supabase URL + service role key are present."""
    return bool(settings.supabase_url and settings.supabase_service_role_key)


def generate_temporary_password() -> str:
    """A strong one-time password shown to the inviter once, never stored."""
    return secrets.token_urlsafe(12)


def _base_and_headers() -> tuple[str, dict[str, str]]:
    base = (settings.supabase_url or "").rstrip("/") + "/auth/v1"
    key = settings.supabase_service_role_key or ""
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    return base, headers


async def find_user_id_by_email(email: str) -> str | None:
    """Page through admin users to find one by email (case-insensitive)."""
    base, headers = _base_and_headers()
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        for page in range(1, _MAX_PAGES + 1):
            resp = await client.get(
                f"{base}/admin/users",
                headers=headers,
                params={"page": page, "per_page": _PER_PAGE},
            )
            resp.raise_for_status()
            users = resp.json().get("users", [])
            if not users:
                return None
            for user in users:
                if (user.get("email") or "").lower() == email.lower():
                    return str(user["id"])
    return None


async def create_confirmed_user(email: str, password: str, full_name: str | None) -> str | None:
    """Create a confirmed auth user; return its id, or None if the email exists.

    A 409/422 from GoTrue means the address is already registered — the caller
    then attaches a membership to the existing user instead of failing.
    """
    base, headers = _base_and_headers()
    payload: dict[str, object] = {
        "email": email,
        "password": password,
        "email_confirm": True,
    }
    if full_name:
        payload["user_metadata"] = {"full_name": full_name}

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(f"{base}/admin/users", headers=headers, json=payload)

    if resp.status_code in (200, 201):
        return str(resp.json()["id"])
    if resp.status_code in (409, 422):
        return None
    raise SupabaseAdminError(f"admin API returned {resp.status_code}")
