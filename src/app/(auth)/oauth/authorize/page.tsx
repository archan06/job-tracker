import { CheckCircle, Warning } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { SCOPE_LABELS } from "@/lib/oauth/params";
import { decideConsentAction } from "@/server/actions/oauth";
import { auth } from "@/server/auth";
import { validateAuthorizeRequest } from "@/server/oauth/authorize";
import { originFromHeaders } from "@/server/oauth/urls";

export const metadata: Metadata = { title: "Connect an app" };

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-surface p-6 shadow-card sm:p-8">{children}</div>;
}

export default async function AuthorizePage(props: PageProps<"/oauth/authorize">) {
  // Every request is unique (client, PKCE challenge, session), so never prerender.
  await connection();
  const raw = await props.searchParams;
  const params = Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string"));
  const query = new URLSearchParams(params).toString();
  const origin = originFromHeaders(await headers());

  const result = await validateAuthorizeRequest(params, origin);
  if (!result.ok) {
    if (result.redirect) redirect(result.redirect.toString());
    return (
      <Card>
        <h1 className="text-xl font-semibold tracking-tight text-text">Can&apos;t connect this app</h1>
        <p className="mt-2 text-sm text-muted">{result.message}</p>
        <Link href="/board" className="mt-6 inline-block text-sm font-medium text-primary-text hover:underline">
          Go to your board
        </Link>
      </Card>
    );
  }

  const session = await auth();
  if (!session?.user?.id) redirect(`/login?callbackUrl=${encodeURIComponent(`/oauth/authorize?${query}`)}`);

  const { client, redirectUri, scopes } = result.request;
  const publisher = client.kind === "CIMD" ? new URL(client.id).hostname : null;

  return (
    <Card>
      <h1 className="text-xl font-semibold tracking-tight text-text">
        Allow <span className="wrap-anywhere">{client.name}</span> to access your Landed board?
      </h1>
      <p className="mt-1.5 text-sm text-muted">
        Signed in as <span className="font-medium text-text">{session.user.email}</span>
      </p>

      {publisher ? (
        <p className="mt-4 text-sm text-muted">Published by {publisher}</p>
      ) : (
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-surface-muted px-3 py-2.5 text-sm text-muted">
          <Warning size={18} className="mt-px shrink-0 text-status-withdrawn" />
          <span>Unverified app: it named itself. Only continue if you started this from Claude, ChatGPT or another app you trust.</span>
        </p>
      )}

      <p className="mt-5 text-sm font-medium text-text">It will be able to:</p>
      <ul className="mt-2 flex flex-col gap-2">
        {scopes.map((scope) => (
          <li key={scope} className="flex items-center gap-2 text-sm text-text">
            <CheckCircle size={18} weight="fill" className="shrink-0 text-primary" />
            {SCOPE_LABELS[scope]}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-subtle">It can&apos;t delete anything. You can disconnect it anytime in Connected apps.</p>

      <p className="mt-5 text-xs text-subtle">
        You&apos;ll be sent back to <span className="font-medium text-muted">{new URL(redirectUri).host}</span>
      </p>

      <form action={decideConsentAction} className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <input type="hidden" name="query" value={query} />
        <Button type="submit" name="decision" value="deny" variant="secondary">
          Deny
        </Button>
        <Button type="submit" name="decision" value="allow">
          Allow
        </Button>
      </form>
    </Card>
  );
}
