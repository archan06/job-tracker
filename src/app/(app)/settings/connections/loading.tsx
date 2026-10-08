import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading connected apps" className="mx-auto max-w-3xl">
      <Skeleton className="mb-2 h-8 w-48" />
      <Skeleton className="mb-6 h-4 w-80 max-w-full" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="mt-6 h-36 w-full rounded-xl" />
    </div>
  );
}
