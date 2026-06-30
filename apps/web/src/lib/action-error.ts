import { extractErrorCode } from "@/lib/errors";

/**
 * A single-slot store for the **blocking action error** shown in a modal. Like
 * the toast store it is a module singleton (not a hook) so it can be fired from
 * outside React — notably the global TanStack mutation cache, which reports a
 * failed mutation after the component that triggered it may have navigated away
 * (e.g. order intake → board). `<ActionErrorDialog />` subscribes and renders.
 *
 * Toasts stay for minor/transient info; anything that *blocks* an action a user
 * tried to take (failed create/close/pay/shift/admin op, validation, capability,
 * server error) goes here so it cannot be missed.
 */

export interface ActionError {
  /** Stable backend code (e.g. "shift.not_open"), or null for an uncoded error. */
  code: string | null;
}

let current: ActionError | null = null;
const listeners = new Set<(error: ActionError | null) => void>();

function emit(): void {
  for (const listener of listeners) listener(current);
}

export function subscribeActionError(
  listener: (error: ActionError | null) => void,
): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

export function getActionError(): ActionError | null {
  return current;
}

/** Surface a failed action as a blocking modal. Safe to call from anywhere. */
export function reportActionError(error: unknown): void {
  current = { code: extractErrorCode(error) ?? null };
  emit();
}

export function dismissActionError(): void {
  current = null;
  emit();
}
