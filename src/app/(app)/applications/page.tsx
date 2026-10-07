import { ListBullets, MagnifyingGlass, Plus } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ApplicationsTable } from "@/components/table/applications-table";
import { Pagination } from "@/components/table/pagination";
import { TableFilters } from "@/components/table/table-filters";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { toDateInputValue } from "@/lib/dates";
import { parseTableQuery, toSearchParams } from "@/lib/table-query";
import { requireUserId } from "@/server/auth";
import { countApplications, listApplications } from "@/server/services/applications";

export const metadata: Metadata = { title: "Applications" };

const PAGE_SIZE = 50;

export default async function ApplicationsPage(props: PageProps<"/applications">) {
  const userId = await requireUserId();
  const filters = parseTableQuery(await props.searchParams);
  const page = filters.page ?? 1;
  // The overall total tells "nothing matches" apart from "nothing yet".
  const [applications, matching, total] = await Promise.all([
    listApplications(userId, filters, { page, pageSize: PAGE_SIZE }),
    countApplications(userId, filters),
    countApplications(userId),
  ]);
  const pageCount = Math.max(1, Math.ceil(matching / PAGE_SIZE));
  if (page > pageCount) {
    const query = toSearchParams({ ...filters, page: pageCount }).toString();
    redirect(`/applications${query ? `?${query}` : ""}`);
  }

  if (total === 0) {
    return (
      <>
        <PageHeader title="Applications" />
        <EmptyState
          icon={<ListBullets size={24} />}
          title="No applications yet"
          description="Everything you track shows up here, ready to sort and filter."
          action={
            <ButtonLink href="/applications/new">
              <Plus size={16} weight="bold" />
              Add your first application
            </ButtonLink>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Applications"
        description={matching === total ? `${total.toLocaleString("en-US")} total` : `${matching.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} match`}
      />
      <TableFilters
        values={{
          statuses: filters.statuses ?? [],
          sources: filters.sources ?? [],
          company: filters.company ?? "",
          from: filters.appliedFrom ? toDateInputValue(filters.appliedFrom) : "",
          to: filters.appliedTo ? toDateInputValue(filters.appliedTo) : "",
          sort: filters.sort === "updatedAt" ? undefined : filters.sort,
          dir: filters.dir === "desc" ? undefined : filters.dir,
        }}
      />
      {applications.length === 0 ? (
        <EmptyState
          icon={<MagnifyingGlass size={24} />}
          title="No applications match these filters"
          description="Try a different status or date range, or clear the filters to see everything."
          action={
            <Link href="/applications" className={buttonClasses("secondary")}>
              Clear filters
            </Link>
          }
        />
      ) : (
        <>
          <ApplicationsTable applications={applications} filters={filters} />
          <Pagination filters={filters} page={page} pageCount={pageCount} pageSize={PAGE_SIZE} matching={matching} />
        </>
      )}
    </>
  );
}
