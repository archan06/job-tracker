import { z } from "zod";
import type { OAuthClient } from "@/generated/prisma/client";
import { randomToken } from "@/lib/oauth/crypto";
import { isAllowedRedirectUri } from "@/lib/oauth/params";
import { db } from "@/server/db";
import { fetchClientMetadata, isMetadataUrl } from "./cimd";
import { OAuthError } from "./errors";

const CIMD_TTL_MS = 24 * 60 * 60_000;

const registrationSchema = z.object({
  client_name: z.string().trim().min(1).max(100).optional(),
  redirect_uris: z.array(z.string().refine(isAllowedRedirectUri)).min(1).max(10),
  // Only public clients (PKCE, no secret) are supported.
  token_endpoint_auth_method: z.literal("none").optional(),
  grant_types: z.array(z.enum(["authorization_code", "refresh_token"])).optional(),
  response_types: z.array(z.literal("code")).optional(),
});

/** Dynamic Client Registration (RFC 7591). Deprecated by MCP 2026-07-28 but still used by ChatGPT. */
export async function registerClient(body: unknown, now = new Date()) {
  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) throw new OAuthError("invalid_client_metadata", parsed.error.issues[0]?.message ?? "Invalid client metadata");
  const client = await db.oAuthClient.create({
    data: {
      // Never an https URL, so a registered client can't impersonate a CIMD client_id.
      id: `dcr_${randomToken()}`,
      name: parsed.data.client_name ?? "Unknown app",
      redirectUris: parsed.data.redirect_uris,
      kind: "DCR",
      createdAt: now,
      refreshedAt: now,
    },
  });
  return {
    client_id: client.id,
    client_id_issued_at: Math.floor(now.getTime() / 1000),
    client_name: client.name,
    redirect_uris: client.redirectUris,
    token_endpoint_auth_method: "none" as const,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
}

type ResolveDeps = { fetchMetadata?: typeof fetchClientMetadata; now?: Date };

/** The client for a client_id: a registered (DCR) client, or a CIMD client fetched from its URL and cached for a day. */
export async function resolveClient(clientId: string, { fetchMetadata = fetchClientMetadata, now = new Date() }: ResolveDeps = {}): Promise<OAuthClient | null> {
  const cached = await db.oAuthClient.findUnique({ where: { id: clientId } });
  if (!isMetadataUrl(clientId)) return cached?.kind === "DCR" ? cached : null;
  if (cached && now.getTime() - cached.refreshedAt.getTime() < CIMD_TTL_MS) return cached;
  try {
    const { name, redirectUris } = await fetchMetadata(clientId);
    const data = { name, redirectUris, kind: "CIMD" as const, refreshedAt: now };
    return await db.oAuthClient.upsert({ where: { id: clientId }, create: { id: clientId, ...data }, update: data });
  } catch (error) {
    console.warn("client metadata fetch failed", clientId, error);
    return cached;
  }
}
