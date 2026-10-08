import { expect, test, vi } from "vitest";
import { db } from "@/server/db";
import { registerClient, resolveClient } from "@/server/oauth/clients";
import { OAuthError } from "@/server/oauth/errors";

const now = new Date("2026-10-07T12:00:00Z");

test("DCR registers a public client and resolves it by id", async () => {
  const res = await registerClient({ client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }, now);
  expect(res).toMatchObject({
    client_name: "Claude",
    redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  });
  expect(res.client_id).toMatch(/^[A-Za-z0-9_-]{20,}$/);
  const client = await resolveClient(res.client_id);
  expect(client).toMatchObject({ id: res.client_id, name: "Claude", kind: "DCR" });
});

test.each([
  [{ redirect_uris: [] }],
  [{ redirect_uris: ["http://evil.example/cb"] }],
  [{ redirect_uris: ["https://ok.example/cb"], token_endpoint_auth_method: "client_secret_basic" }],
  [{ client_name: "x".repeat(101), redirect_uris: ["https://ok.example/cb"] }],
  ["not an object"],
])("DCR rejects invalid metadata %#", async (body) => {
  await expect(registerClient(body, now)).rejects.toMatchObject({ code: "invalid_client_metadata" });
  await expect(registerClient(body, now)).rejects.toBeInstanceOf(OAuthError);
});

test("an unnamed DCR client is called 'Unknown app'", async () => {
  const res = await registerClient({ redirect_uris: ["https://ok.example/cb"] }, now);
  expect(res.client_name).toBe("Unknown app");
});

test("unknown ids resolve to null", async () => {
  expect(await resolveClient("nope")).toBeNull();
});

test("CIMD clients are fetched once, cached for 24 hours, then refreshed", async () => {
  const id = "https://claude.ai/oauth/claude-client.json";
  const fetchMetadata = vi.fn(async () => ({ name: "Claude", redirectUris: ["https://claude.ai/api/mcp/auth_callback"] }));
  expect(await resolveClient(id, { fetchMetadata, now })).toMatchObject({ id, name: "Claude", kind: "CIMD" });
  await resolveClient(id, { fetchMetadata, now: new Date(now.getTime() + 60 * 60_000) });
  expect(fetchMetadata).toHaveBeenCalledTimes(1);
  fetchMetadata.mockResolvedValueOnce({ name: "Claude 2", redirectUris: ["https://claude.ai/cb2"] });
  expect(await resolveClient(id, { fetchMetadata, now: new Date(now.getTime() + 25 * 60 * 60_000) })).toMatchObject({
    name: "Claude 2",
    redirectUris: ["https://claude.ai/cb2"],
  });
});

test("a CIMD fetch failure uses the cached copy, or resolves to null without one", async () => {
  const id = "https://claude.ai/oauth/claude-client.json";
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const failing = vi.fn(async () => Promise.reject(new Error("down")));
  expect(await resolveClient(id, { fetchMetadata: failing, now })).toBeNull();
  await db.oAuthClient.create({ data: { id, name: "Claude", redirectUris: ["https://claude.ai/cb"], kind: "CIMD", refreshedAt: new Date("2020-01-01") } });
  expect(await resolveClient(id, { fetchMetadata: failing, now })).toMatchObject({ name: "Claude" });
  warn.mockRestore();
});

test("a DCR id that looks like a URL can't be registered, so CIMD ids can't be spoofed", async () => {
  const res = await registerClient({ redirect_uris: ["https://ok.example/cb"] }, now);
  expect(res.client_id.startsWith("https://")).toBe(false);
});
