"use client";

import { Check, Copy } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { regenerateAddressAction } from "@/server/actions/inbound";

export const GMAIL_FILTER_QUERY =
  'subject:(application OR applying OR interview OR offer OR "next steps") OR from:(greenhouse.io OR lever.co OR myworkday.com OR ashbyhq.com OR smartrecruiters.com OR icims.com)';

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      aria-label={label}
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check size={14} weight="bold" /> : <Copy size={14} />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

export function AddressCard({ address, forwarding }: { address: string; forwarding: { code: string | null; link: string | null } | null }) {
  const [pending, start] = useTransition();
  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <h2 className="text-sm font-semibold text-text">Your private forwarding address</h2>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <code data-testid="inbound-address" className="min-w-0 flex-1 rounded-lg bg-surface-muted px-3 py-2.5 font-mono text-sm wrap-anywhere text-text">
          {address}
        </code>
        <CopyButton text={address} label="Copy address" />
      </div>

      <ol className="mt-5 flex list-decimal flex-col gap-3 pl-5 text-sm text-muted">
        <li>
          In Gmail, open <span className="font-medium text-text">Settings → Forwarding and POP/IMAP → Add a forwarding address</span> and paste the address above.
          {forwarding?.link ? (
            <span className="mt-2 block">
              <a
                href={forwarding.link}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses("primary", "sm")}
              >
                Confirm forwarding in Gmail
              </a>
            </span>
          ) : forwarding?.code ? (
            <span className="mt-1 block text-text">
              Gmail&apos;s confirmation code: <span className="font-mono font-semibold">{forwarding.code}</span>
            </span>
          ) : (
            <span className="mt-1 block">Gmail will send a confirmation link here; it will appear on this page.</span>
          )}
        </li>
        <li>
          Create a filter (search options → Create filter) with this search, then choose <span className="font-medium text-text">Forward it to</span> your address:
          <span className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
            <code className="min-w-0 flex-1 rounded-lg bg-surface-muted px-3 py-2 font-mono text-xs wrap-anywhere text-text">{GMAIL_FILTER_QUERY}</code>
            <CopyButton text={GMAIL_FILTER_QUERY} label="Copy filter search" />
          </span>
        </li>
        <li>New job emails will update your board and show up below.</li>
      </ol>

      <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between">
        <p>
          Landed keeps only the sender, subject and a short preview for 90 days, never the full email. Emails are read by Claude (Anthropic) to work out what they mean.
        </p>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (confirm("Get a new address? The current one will stop working, so update your Gmail forwarding too.")) {
              start(async () => void (await regenerateAddressAction()));
            }
          }}
        >
          New address
        </Button>
      </div>
    </section>
  );
}
