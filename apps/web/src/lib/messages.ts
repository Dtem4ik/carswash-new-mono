/**
 * Minimal message catalog. Phase 4 introduces next-intl with per-locale JSON
 * catalogs; until then, user-facing strings live here (single place to swap)
 * rather than being scattered as string literals across components.
 */

export const messages = {
  "app.name": "CarsWash",
  "auth.signInTitle": "Sign in",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.signIn": "Sign in",
  "auth.signingIn": "Signing in…",
  "auth.signOut": "Sign out",
  "auth.invalidCredentials": "Invalid email or password",
  "dashboard.title": "Dashboard",
  "dashboard.role": "Role",
  "dashboard.activeCarWash": "Active car wash",
  "dashboard.accessibleCarWashes": "Accessible car washes",
  "dashboard.capabilities": "Capabilities",
  "dashboard.contextUnavailable":
    "Could not load your tenant context. Is the API running?",
} as const;

export type MessageKey = keyof typeof messages;

/** Resolve a message code to its (currently English-only) string. */
export function t(key: MessageKey): string {
  return messages[key];
}
