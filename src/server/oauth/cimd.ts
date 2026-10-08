import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { z } from "zod";
import { isAllowedRedirectUri } from "@/lib/oauth/params";

const MAX_BYTES = 64 * 1024;
const TIMEOUT_MS = 5000;

// Addresses a server must never be tricked into fetching (SSRF): loopback, private, link-local, CGNAT, etc.
const PRIVATE = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3],
] as const) PRIVATE.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [["::", 127], ["64:ff9b::", 96], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const) PRIVATE.addSubnet(net, prefix, "ipv6");

export function isPrivateAddress(ip: string): boolean {
  const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  const family = isIP(ip);
  if (family === 4) return PRIVATE.check(ip, "ipv4");
  if (family === 6) return PRIVATE.check(ip, "ipv6");
  return true;
}

const documentSchema = z.object({
  client_id: z.string(),
  client_name: z.string().trim().min(1).max(100).optional(),
  redirect_uris: z.array(z.string()).min(1).max(10),
});

type Deps = {
  lookup?: (host: string) => Promise<string[]>;
  fetchImpl?: typeof fetch;
};

const defaultLookup = async (host: string) => (await dnsLookup(host, { all: true })).map((a) => a.address);

/** Is this client_id a Client ID Metadata Document URL (rather than a registered id)? */
export function isMetadataUrl(clientId: string): boolean {
  return clientId.startsWith("https://");
}

/**
 * Fetches and validates a Client ID Metadata Document: the client_id is an https URL serving
 * the client's name and redirect URIs. Guarded against SSRF (private addresses, redirects,
 * slow or huge responses). Throws on anything invalid.
 */
export async function fetchClientMetadata(
  clientId: string,
  { lookup = defaultLookup, fetchImpl = fetch }: Deps = {},
): Promise<{ name: string; redirectUris: string[] }> {
  const url = new URL(clientId);
  if (url.protocol !== "https:" || url.pathname === "/" || url.username || url.password || url.hash) {
    throw new Error("client_id must be an https URL with a path");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) || host === "localhost" || host.endsWith(".localhost")) throw new Error("client_id host not allowed");
  const addresses = await lookup(host);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw new Error("client_id host not allowed");

  const response = await fetchImpl(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  if (response.status !== 200) throw new Error(`metadata fetch failed: ${response.status}`);

  const reader = response.body?.getReader();
  if (!reader) throw new Error("empty metadata document");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new Error("metadata document too large");
    }
    chunks.push(value);
  }
  const doc = documentSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  if (doc.client_id !== clientId) throw new Error("client_id does not match the metadata URL");
  if (!doc.redirect_uris.every(isAllowedRedirectUri)) throw new Error("unsafe redirect_uris");
  return { name: doc.client_name ?? url.hostname, redirectUris: doc.redirect_uris };
}
