import { ArrowDown, ArrowUp, CaretUpDown } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { StatusBadge } from "@/components/applications/status-badge";
import { formatDateOnly } from "@/lib/dates";
import { SOURCE_LABELS } from "@/lib/status";
import { toSearchParams } from "@/lib/table-query";
import type { TableQuery } from "@/lib/table-query";
import type { ApplicationSort, ApplicationSummary } from "@/server/services/applications";

const updatedFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

function SortHeader({ label, column, filters, className = "" }: {
  label: string;
  column: ApplicationSort;
  filters: TableQuery;
  className?: string;
}) {
  const active = filters.sort === column;
  // First click sorts names A-Z and dates newest first.
  const firstDir = column === "dateApplied" || column === "updatedAt" ? "desc" : "asc";
  const dir = active ? (filters.dir === "asc" ? "desc" : "asc") : firstDir;
  const query = toSearchParams({ ...filters, sort: column, dir, page: undefined }).toString();
  const Icon = !active ? CaretUpDown : filters.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (filters.dir === "asc" ? "ascending" : "descending") : "none"} className={`px-4 py-3 font-medium ${className}`}>
      <Link href={`/applications${query ? `?${query}` : ""}`} scroll={false} className={`inline-flex items-center gap-1 rounded hover:text-text ${active ? "text-text" : ""}`}>
        {label}
        <Icon size={13} className={active ? "" : "opacity-50"} />
      </Link>
    </th>
  );
}

export function ApplicationsTable({ applications, filters }: { applications: ApplicationSummary[]; filters: TableQuery }) {
  return (
    <>
      {/* Phones: one card per application. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {applications.map((a) => (
          <li key={a.id} className="relative rounded-xl border border-border bg-surface p-4 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/applications/${a.id}`} title={a.company} dir="auto" className="block truncate font-medium text-text after:absolute after:inset-0 after:rounded-xl">
                  {a.company}
                </Link>
                <p className="mt-0.5 line-clamp-2 text-sm wrap-anywhere text-muted">{a.title}</p>
              </div>
              <StatusBadge status={a.status} />
            </div>
            <p className="mt-3 text-xs text-muted">
              {SOURCE_LABELS[a.source]}
              {a.dateApplied && <> &middot; Applied {formatDateOnly(a.dateApplied)}</>}
            </p>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface shadow-card md:block">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="border-b border-border bg-surface-muted text-xs text-muted">
            <tr>
              <SortHeader label="Company" column="company" filters={filters} />
              <SortHeader label="Role" column="title" filters={filters} />
              <SortHeader label="Status" column="status" filters={filters} />
              <th scope="col" className="px-4 py-3 font-medium">Source</th>
              <SortHeader label="Applied" column="dateApplied" filters={filters} />
              <SortHeader label="Updated" column="updatedAt" filters={filters} />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {applications.map((a) => (
              <tr key={a.id} className="transition-colors hover:bg-surface-muted">
                <td className="max-w-56 px-4 py-3">
                  <Link href={`/applications/${a.id}`} title={a.company} dir="auto" className="block truncate font-medium text-text hover:text-primary-text">
                    {a.company}
                  </Link>
                  {a.location && <span className="block truncate text-xs text-muted">{a.location}</span>}
                </td>
                <td className="max-w-72 px-4 py-3 text-muted">
                  <span dir="auto" className="line-clamp-2 wrap-anywhere" title={a.title}>{a.title}</span>
                </td>
                <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                <td className="px-4 py-3 whitespace-nowrap text-muted">{SOURCE_LABELS[a.source]}</td>
                <td className="px-4 py-3 whitespace-nowrap text-muted tabular-nums">{a.dateApplied ? formatDateOnly(a.dateApplied) : "-"}</td>
                <td className="px-4 py-3 whitespace-nowrap text-muted">{updatedFormat.format(a.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
