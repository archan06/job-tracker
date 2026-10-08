import { PlugsConnected } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SCOPE_LABELS, type Scope } from "@/lib/oauth/params";
import { disconnectAppAction } from "@/server/actions/oauth";
import { requireUserId } from "@/server/auth";
import { listGrants } from "@/server/oauth/grants";
import { mcpResource, originFromHeaders } from "@/server/oauth/urls";

export const metadata: Metadata = { title: "Connected apps" };

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function ConnectionsPage() {
  const userId = await requireUserId();
  const [grants, connectorUrl] = await Promise.all([listGrants(userId), headers().then((h) => mcpResource(originFromHeaders(h)))]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Connected apps" description="Apps like Claude and ChatGPT that can read and update your board." />

      <section className="rounded-xl border border-border bg-surface shadow-card">
        {grants.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <PlugsConnected size={28} className="text-subtle" />
            <p className="font-medium text-text">No apps connected</p>
            <p className="text-sm text-muted">Connect Claude or ChatGPT using the address below.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {grants.map((grant) => (
              <li key={grant.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-medium text-text">{grant.clientName}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    {grant.scopes.map((s) => SCOPE_LABELS[s as Scope] ?? s).join(" · ")}
                  </p>
                  <p className="mt-1 text-xs text-subtle">
                    Connected {dateFormat.format(grant.createdAt)}
                    {grant.lastUsedAt && <> · Last used {dateFormat.format(grant.lastUsedAt)}</>}
                  </p>
                </div>
                <form action={disconnectAppAction.bind(null, grant.id)}>
                  <Button type="submit" variant="secondary" size="sm" aria-label={`Disconnect ${grant.clientName}`}>
                    Disconnect
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-border bg-surface p-5 shadow-card sm:p-6">
        <h2 className="text-sm font-semibold text-text">How to connect</h2>
        <p className="mt-1.5 text-sm text-muted">
          In Claude, open Settings → Connectors → Add custom connector. In ChatGPT, turn on Developer mode, then add a connector. Use this address:
        </p>
        <code className="mt-3 block rounded-lg bg-surface-muted px-3 py-2.5 font-mono text-sm wrap-anywhere text-text">{connectorUrl}</code>
        <p className="mt-3 text-xs text-subtle">You&apos;ll sign in to Landed and choose what the app can do. It can never delete applications.</p>
      </section>
    </div>
  );
}
