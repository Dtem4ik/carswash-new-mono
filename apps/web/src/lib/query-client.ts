import { MutationCache, QueryClient } from "@tanstack/react-query";
import { reportActionError } from "@/lib/action-error";

/**
 * Context an optimistic order mutation stashes from `onMutate`. The reconcile /
 * rollback closures capture the queryClient and the snapshot, so the global
 * mutation cache can finish the job even after the component that fired the
 * mutation has unmounted (e.g. intake navigates to the board on submit). React
 * Query observer-level callbacks do not run after unmount; mutation-cache
 * callbacks always do.
 */
export interface OptimisticContext {
  /** Restore the pre-mutation cache snapshot. */
  rollback: () => void;
  /** Fold the authoritative server response into the cache. */
  reconcile: (data: unknown) => void;
}

function asOptimistic(context: unknown): OptimisticContext | null {
  if (context && typeof context === "object" && "rollback" in context) {
    return context as OptimisticContext;
  }
  return null;
}

/**
 * One QueryClient per app session. Mutation reconciliation lives on the
 * mutation cache (not per-hook) so optimistic create/close/cancel/payment
 * settle correctly regardless of which component is still mounted.
 *
 * Every mutation failure is surfaced to the user (Error-UX standard, docs/UI.md):
 * by default it rolls back any optimistic change and opens the blocking error
 * modal. A mutation that owns its own inline error UI (a form dialog) opts out
 * with `meta: { errorMode: "inline" }`.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: false },
    },
    mutationCache: new MutationCache({
      onSuccess: (data, _vars, context) => {
        asOptimistic(context)?.reconcile(data);
      },
      onError: (error, _vars, context, mutation) => {
        asOptimistic(context)?.rollback();
        if (mutation.meta?.errorMode === "inline") return;
        reportActionError(error);
      },
    }),
  });
}
