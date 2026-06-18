/**
 * Resolve a backend error CODE (e.g. "shift.not_open") to a localized message.
 * The API returns stable codes in `{ "code": ... }`; the UI maps them via the
 * `errors` message namespace and falls back to a generic message for unknown
 * codes. Kept translator-agnostic so it is trivially unit-testable.
 */

export interface ErrorTranslator {
  (key: string): string;
  has: (key: string) => boolean;
}

/**
 * Adapt a next-intl translator (callable + `.has`) to the `ErrorTranslator`
 * shape this module consumes. Kept here so screens don't re-implement it.
 */
export function toErrorTranslator(t: {
  (key: string): string;
  has: (key: string) => boolean;
}): ErrorTranslator {
  const fn = ((key: string) => t(key)) as ErrorTranslator;
  fn.has = (key: string) => t.has(key);
  return fn;
}

export function resolveErrorMessage(
  t: ErrorTranslator,
  code: string | null | undefined,
): string {
  if (code && t.has(code)) return t(code);
  return t("unknown");
}

/**
 * Pull the stable code out of a FastAPI error body. Errors are raised as
 * `HTTPException(detail={"code": ...})`, which serializes to `{ detail: { code } }`.
 */
export function extractErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "detail" in error) {
    const detail = (error as { detail?: unknown }).detail;
    if (detail && typeof detail === "object" && "code" in detail) {
      const code = (detail as { code?: unknown }).code;
      if (typeof code === "string") return code;
    }
  }
  return undefined;
}
