import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const SKELETON_KEYS = ["a", "b", "c", "d", "e", "f", "g", "h"];

/** Loading placeholder — mirrors the context strip + bay cards (docs/UI.md). */
export function BoardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="bg-card flex flex-col gap-4 rounded-2xl border p-4 shadow-sm sm:flex-row sm:items-center sm:gap-8 sm:px-6">
        {["s1", "s2", "s3"].map((key) => (
          <div key={key} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {SKELETON_KEYS.map((key) => (
          <Card key={key} className="relative gap-0 overflow-hidden p-5">
            <span
              aria-hidden="true"
              className="bg-muted absolute inset-y-0 left-0 w-1.5"
            />
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="mt-4 space-y-2">
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-32" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
