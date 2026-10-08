"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUserId } from "@/server/auth";
import { clientRedirect, validateAuthorizeRequest } from "@/server/oauth/authorize";
import { createAuthorizationCode } from "@/server/oauth/grants";
import { originFromHeaders } from "@/server/oauth/urls";

/**
 * The consent decision. Everything is validated again from the original query, so nothing
 * on the page can be tampered with to widen what's granted.
 */
export async function decideConsentAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const origin = originFromHeaders(await headers());
  const query = new URLSearchParams(String(formData.get("query") ?? ""));
  const result = await validateAuthorizeRequest(Object.fromEntries(query), origin);
  if (!result.ok) {
    if (result.redirect) redirect(result.redirect.toString());
    redirect(`/oauth/authorize?${query}`);
  }
  const { client, redirectUri, state, scopes, codeChallenge, resource } = result.request;
  if (formData.get("decision") !== "allow") {
    redirect(clientRedirect(redirectUri, origin, state, { error: "access_denied", error_description: "The user denied access" }).toString());
  }
  const code = await createAuthorizationCode({ clientId: client.id, userId, redirectUri, codeChallenge, scopes, resource });
  redirect(clientRedirect(redirectUri, origin, state, { code }).toString());
}
