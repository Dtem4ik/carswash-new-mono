import { MutationCache, QueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";

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
  /**
   * Build the localized failure toast from the error, in React scope where the
   * i18n translator is available. Omit to stay silent (an inline UI on a still
   * mounted surface shows the error itself).
   */
  describeError?: (error: unknown) => string;
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
      onError: (error, _vars, context) => {
        const ctx = asOptimistic(context);
        ctx?.rollback();
        if (ctx?.describeError) toast(ctx.describeError(error), "destructive");
      },
    }),
  });
}
