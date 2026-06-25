"use client";

import { X } from "lucide-react";
import { useSyncExternalStore } from "react";
import {
  dismissToast,
  getToasts,
  subscribeToasts,
  type ToastItem,
} from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * Renders the toast store as a fixed bottom-right stack. Quiet by design
 * (docs/UI.md): a single themed surface, a 150ms fade-in, no looping motion.
 * Destructive toasts (a rolled-back optimistic mutation) carry the destructive
 * tone; everything is a token, never a raw color.
 */
export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getToasts);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end"
    >
      {toasts.map((t) => (
        <ToastRow key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastRow({ toast }: { toast: ToastItem }) {
  return (
    <div
      role={toast.variant === "destructive" ? "alert" : "status"}
      className={cn(
        "animate-in fade-in-0 slide-in-from-bottom-2 pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border p-4 shadow-md duration-150",
        toast.variant === "destructive"
          ? "border-destructive/30 bg-card text-destructive"
          : "bg-card text-foreground",
      )}
    >
      <p className="flex-1 text-sm">{toast.message}</p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => dismissToast(toast.id)}
        className="text-muted-foreground hover:text-foreground -m-1 p-1"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
