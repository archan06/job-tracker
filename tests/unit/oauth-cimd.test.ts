import { expect, test } from "vitest";
import { fetchClientMetadata, isPrivateAddress } from "@/server/oauth/cimd";

const URL_ID = "https://claude.ai/oauth/claude-client.json";
const okDoc = { client_id: URL_ID, client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] };
const publicLookup = async () => ["160.79.104.10"];
const respond = (body: unknown, init: ResponseInit = {}) =>
  (async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200, ...init })) as unknown as typeof fetch;

test.each(["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.5.4", "192.168.1.1", "0.0.0.0", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::a00:1"])(
  "%s is private",
  (ip) => expect(isPrivateAddress(ip)).toBe(true),
);
test.each(["160.79.104.10", "8.8.8.8", "2606:4700::1111", "172.32.0.1"])("%s is public", (ip) => expect(isPrivateAddress(ip)).toBe(false));

test("a valid document gives the client's name and redirect URIs", async () => {
  expect(await fetchClientMetadata(URL_ID, { lookup: publicLookup, fetchImpl: respond(okDoc) })).toEqual({
    name: "Claude",
    redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
  });
});

test("the name falls back to the host when missing", async () => {
  const { client_name: _, ...doc } = okDoc;
  expect((await fetchClientMetadata(URL_ID, { lookup: publicLookup, fetchImpl: respond(doc) })).name).toBe("claude.ai");
});

test.each([
  ["http URL", "http://claude.ai/client.json"],
  ["no path", "https://claude.ai/"],
  ["IP literal", "https://127.0.0.1/client.json"],
  ["localhost", "https://localhost/client.json"],
])("rejects a %s client_id", async (_, url) => {
  await expect(fetchClientMetadata(url, { lookup: publicLookup, fetchImpl: respond({ ...okDoc, client_id: url }) })).rejects.toThrow();
});

test("rejects hosts that resolve to private addresses", async () => {
  await expect(fetchClientMetadata(URL_ID, { lookup: async () => ["160.79.104.10", "10.0.0.5"], fetchImpl: respond(okDoc) })).rejects.toThrow();
});

test.each([
  ["redirects", respond("", { status: 302, headers: { location: "https://evil.example/x.json" } })],
  ["errors", respond(okDoc, { status: 500 })],
  ["mismatched client_id", respond({ ...okDoc, client_id: "https://other.example/c.json" })],
  ["no redirect_uris", respond({ ...okDoc, redirect_uris: [] })],
  ["unsafe redirect_uris", respond({ ...okDoc, redirect_uris: ["http://evil.example/cb"] })],
  ["non-JSON", respond("<html>")],
  ["oversized bodies", respond(JSON.stringify({ ...okDoc, pad: "x".repeat(70_000) }))],
])("rejects documents with %s", async (_, fetchImpl) => {
  await expect(fetchClientMetadata(URL_ID, { lookup: publicLookup, fetchImpl })).rejects.toThrow();
});
