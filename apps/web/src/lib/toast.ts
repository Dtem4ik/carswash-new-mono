/**
 * A tiny dependency-free toast store. It is a module singleton (not a hook) so
 * it can be fired from outside React — notably the global TanStack Query
 * mutation cache, which reports a failed optimistic mutation after the form
 * that triggered it has already navigated away. `<Toaster />` subscribes and
 * renders; see `src/components/ui/toaster.tsx`.
 */

export type ToastVariant = "default" | "destructive";

export interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

const AUTO_DISMISS_MS = 5000;

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<(items: ToastItem[]) => void>();

function emit(): void {
  for (const listener of listeners) listener(items);
}

export function subscribeToasts(
  listener: (items: ToastItem[]) => void,
): () => void {
  listeners.add(listener);
  listener(items);
  return () => {
    listeners.delete(listener);
  };
}

export function getToasts(): ToastItem[] {
  return items;
}

export function dismissToast(id: number): void {
  items = items.filter((t) => t.id !== id);
  emit();
}

export function toast(
  message: string,
  variant: ToastVariant = "default",
): number {
  seq += 1;
  const id = seq;
  items = [...items, { id, message, variant }];
  emit();
  if (typeof window !== "undefined") {
    window.setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
  }
  return id;
}
