import { Skeleton } from "@/components/ui/skeleton";
import { STATUSES } from "@/lib/status";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading board">
      <Skeleton className="mb-2 h-8 w-32" />
      <Skeleton className="mb-6 h-4 w-80 max-w-full" />
      <div className="-mx-4 overflow-hidden px-4 sm:-mx-6 sm:px-6">
        <div className="flex gap-3">
          {STATUSES.map((s, i) => (
            <div key={s} className="flex w-[min(18rem,calc(100vw-3rem))] shrink-0 flex-col gap-2 rounded-xl bg-surface-muted/70 p-2 ring-1 ring-border dark:bg-surface/50">
              <Skeleton className="mx-1.5 mt-1 mb-2 h-5 w-24" />
              {Array.from({ length: 3 - (i % 3) }, (_, j) => (
                <Skeleton key={j} className="h-28 w-full rounded-xl" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
