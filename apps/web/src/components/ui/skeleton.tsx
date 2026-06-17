import type * as React from "react";

import { cn } from "@/lib/utils";

/** Loading placeholder — skeletons match the real layout (docs/UI.md), not spinners. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-muted animate-pulse rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
