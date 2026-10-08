import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading email" className="mx-auto max-w-4xl">
      <Skeleton className="mb-2 h-8 w-24" />
      <Skeleton className="mb-6 h-4 w-96 max-w-full" />
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="mt-6 h-48 w-full rounded-xl" />
    </div>
  );
}
