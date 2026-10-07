import { ArrowSquareOut, PencilSimple } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { DeleteApplicationButton } from "@/components/applications/delete-application-button";
import { DetailStatusSelect } from "@/components/applications/detail-status-select";
import { StatusBadge } from "@/components/applications/status-badge";
import { CompanyLogo } from "@/components/company-logo";
import { AddEventForm } from "@/components/timeline/add-event-form";
import { Timeline } from "@/components/timeline/timeline";
import { ButtonLink } from "@/components/ui/button";
import { formatDateOnly } from "@/lib/dates";
import { SOURCE_LABELS } from "@/lib/status";
import { requireUserId } from "@/server/auth";
import { getApplication } from "@/server/services/applications";
import { NotFoundError } from "@/server/services/errors";

export const metadata: Metadata = { title: "Application" };

function linkLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd dir="auto" className="mt-1 text-sm wrap-anywhere text-text">{children ?? <span className="text-subtle">-</span>}</dd>
    </div>
  );
}

function Card({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-border bg-surface p-5 shadow-card sm:p-6 ${className}`}>
      <h2 className="mb-4 text-sm font-semibold text-text">{title}</h2>
      {children}
    </section>
  );
}

export default async function ApplicationPage(props: PageProps<"/applications/[id]">) {
  const { id } = await props.params;
  const userId = await requireUserId();
  const application = await getApplication(userId, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const a = application;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <CompanyLogo company={a.company} domain={a.companyDomain} size="lg" className="mt-0.5" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 dir="auto" className="text-2xl font-semibold tracking-tight wrap-anywhere text-text">{a.company}</h1>
              <StatusBadge status={a.status} />
            </div>
            <p dir="auto" className="mt-1 wrap-anywhere text-muted">{a.title}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <DetailStatusSelect id={a.id} company={a.company} status={a.status} />
          <ButtonLink href={`/applications/${a.id}/edit`} variant="secondary">
            <PencilSimple size={16} />
            Edit
          </ButtonLink>
          <DeleteApplicationButton id={a.id} company={a.company} />
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex flex-col gap-5">
          <Card title="Details">
            <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="Location">{a.location}</Detail>
              <Detail label="Salary range">{a.salaryRange}</Detail>
              <Detail label="Source">{SOURCE_LABELS[a.source]}</Detail>
              <Detail label="Date applied">{a.dateApplied ? formatDateOnly(a.dateApplied) : null}</Detail>
              <Detail label="Added">{formatDateOnly(a.createdAt)}</Detail>
              <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                <Detail label="Job posting">
                  {a.url ? (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-full items-center gap-1 font-medium text-primary-text hover:underline"
                    >
                      <span className="truncate">{linkLabel(a.url)}</span>
                      <ArrowSquareOut size={14} className="shrink-0" />
                    </a>
                  ) : null}
                </Detail>
              </div>
            </dl>
          </Card>
          <Card title="Job description">
            {a.description ? (
              <p dir="auto" className="max-w-[70ch] text-sm leading-relaxed whitespace-pre-line wrap-anywhere text-text">{a.description}</p>
            ) : (
              <p className="text-sm text-subtle">No description saved.</p>
            )}
          </Card>
          {a.notes && (
            <Card title="Notes">
              <p dir="auto" className="max-w-[70ch] text-sm leading-relaxed whitespace-pre-line wrap-anywhere text-text">{a.notes}</p>
            </Card>
          )}
        </div>

        <Card title="Activity" className="h-fit">
          <AddEventForm applicationId={a.id} />
          <div className="my-6 h-px bg-border" />
          <Timeline events={a.events} />
        </Card>
      </div>
    </div>
  );
}
