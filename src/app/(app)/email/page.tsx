import { EnvelopeSimple } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import type { InboundEmail, InboundEmailState } from "@/generated/prisma/client";
import { AddressCard } from "@/components/inbox/address-card";
import { FailedActions, ReviewActions, UndoButton } from "@/components/inbox/inbox-actions";
import { PageHeader } from "@/components/ui/page-header";
import { STATUS_LABELS } from "@/lib/status";
import { requireUserId } from "@/server/auth";
import { inboundDomain } from "@/server/inbound/deps";
import { getOrCreateInboundAddress, inboxCounts, latestForwardingConfirmation, listInbox } from "@/server/inbound/service";
import { listApplications } from "@/server/services/applications";

export const metadata: Metadata = { title: "Email" };

const TABS: { key: string; label: string; states: InboundEmailState[] }[] = [
  { key: "review", label: "Needs review", states: ["NEEDS_REVIEW"] },
  { key: "updated", label: "Updated", states: ["UPDATED"] },
  { key: "ignored", label: "Ignored", states: ["IGNORED", "UNDONE"] },
  { key: "failed", label: "Couldn't read", states: ["FAILED"] },
];

const KIND_LABELS: Record<string, string> = {
  APPLICATION_CONFIRMATION: "Application confirmation",
  INTERVIEW: "Interview",
  REJECTION: "Rejection",
  OFFER: "Offer",
  NOT_JOB_RELATED: "Not job-related",
  GMAIL_FORWARDING_CONFIRMATION: "Gmail forwarding confirmation",
};

const timeFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function Outcome({ email }: { email: InboundEmail }) {
  if (email.state === "UNDONE") return <span>Undone</span>;
  if (email.state !== "UPDATED" || !email.applicationId) return null;
  return (
    <span>
      {email.createdApplication ? "Added to your board" : email.appliedStatus ? `Moved to ${STATUS_LABELS[email.appliedStatus]}` : "Logged on the timeline"}
      {" · "}
      <Link href={`/applications/${email.applicationId}`} className="font-medium text-primary-text hover:underline">
        Open
      </Link>
    </span>
  );
}

export default async function EmailPage(props: PageProps<"/email">) {
  const userId = await requireUserId();
  const domain = inboundDomain();
  const { tab: rawTab } = await props.searchParams;
  const stateCounts = await inboxCounts(userId);
  const badge = stateCounts.NEEDS_REVIEW + stateCounts.FAILED;
  const tab = TABS.find((t) => t.key === rawTab) ?? (badge > 0 ? TABS[0] : TABS[1]);

  if (!domain) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Email" description="Forward job emails to Landed and your board updates itself." />
        <p className="rounded-xl border border-border bg-surface p-6 text-sm text-muted shadow-card">Email forwarding isn&apos;t set up on this site yet.</p>
      </div>
    );
  }

  const counts = TABS.map((t) => t.states.reduce((sum, s) => sum + stateCounts[s], 0));
  const [address, forwarding, emails, applications] = await Promise.all([
    getOrCreateInboundAddress(userId, domain),
    latestForwardingConfirmation(userId),
    Promise.all(tab.states.map((s) => listInbox(userId, s))).then((lists) => lists.flat().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())),
    tab.key === "review" ? listApplications(userId, {}, { pageSize: 200 }) : Promise.resolve([]),
  ]);
  const options = applications.map((a) => ({ id: a.id, label: `${a.company} · ${a.title}` }));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Email" description="Forward job emails to Landed and your board updates itself." />
      <AddressCard address={address} forwarding={forwarding} />

      <section className="mt-6 rounded-xl border border-border bg-surface shadow-card">
        <div role="tablist" aria-label="Forwarded emails" className="flex gap-1 overflow-x-auto border-b border-border px-2 pt-2">
          {TABS.map((t, i) => (
            <Link
              key={t.key}
              role="tab"
              aria-selected={t.key === tab.key}
              href={`/email?tab=${t.key}`}
              scroll={false}
              className={`shrink-0 rounded-t-lg px-3 py-2 text-sm font-medium ${t.key === tab.key ? "bg-surface-hover text-text" : "text-muted hover:text-text"}`}
            >
              {t.label} <span className="text-subtle">{counts[i]}</span>
            </Link>
          ))}
        </div>

        {emails.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <EnvelopeSimple size={28} className="text-subtle" />
            <p className="text-sm text-muted">Nothing here yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {emails.map((email) => (
              <li key={email.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-subtle">
                    {email.kind ? KIND_LABELS[email.kind] : "Email"} · {timeFormat.format(email.receivedAt)}
                  </p>
                  <p dir="auto" className="mt-0.5 font-medium wrap-anywhere text-text">{email.subject || "(no subject)"}</p>
                  <p dir="auto" className="truncate text-sm text-muted">{email.fromAddress}</p>
                  {email.summary && <p dir="auto" className="mt-1 text-sm text-text">{email.summary}</p>}
                  {email.reviewReason && <p className="mt-1 text-sm font-medium text-status-withdrawn-text">{email.reviewReason}</p>}
                  <p className="mt-1 text-sm text-muted">
                    <Outcome email={email} />
                  </p>
                </div>
                <div className="shrink-0">
                  {email.state === "UPDATED" && <UndoButton id={email.id} />}
                  {email.state === "NEEDS_REVIEW" && <ReviewActions id={email.id} applications={options} canCreate={!!email.company && !!email.jobTitle} />}
                  {email.state === "FAILED" && <FailedActions id={email.id} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
