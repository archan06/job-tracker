import { CaretLeft, CaretRight } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { toSearchParams, type TableQuery } from "@/lib/table-query";

function href(filters: TableQuery, page: number) {
  const query = toSearchParams({ ...filters, page }).toString();
  return `/applications${query ? `?${query}` : ""}`;
}

export function Pagination({ filters, page, pageCount, pageSize, matching }: {
  filters: TableQuery;
  page: number;
  pageCount: number;
  pageSize: number;
  matching: number;
}) {
  if (pageCount <= 1) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, matching);
  const disabled = "pointer-events-none opacity-40";
  return (
    <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3">
      <p className="text-sm text-muted tabular-nums">
        {first.toLocaleString("en-US")}-{last.toLocaleString("en-US")} of {matching.toLocaleString("en-US")}
      </p>
      <div className="flex gap-2">
        <Link
          href={href(filters, page - 1)}
          aria-disabled={page === 1}
          tabIndex={page === 1 ? -1 : undefined}
          className={buttonClasses("secondary", "sm", page === 1 ? disabled : "")}
        >
          <CaretLeft size={14} />
          Previous
        </Link>
        <Link
          href={href(filters, page + 1)}
          aria-disabled={page === pageCount}
          tabIndex={page === pageCount ? -1 : undefined}
          className={buttonClasses("secondary", "sm", page === pageCount ? disabled : "")}
        >
          Next
          <CaretRight size={14} />
        </Link>
      </div>
    </nav>
  );
}
