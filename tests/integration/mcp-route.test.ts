import { createHash } from "node:crypto";
import { beforeEach, expect, test } from "vitest";
import { POST } from "@/app/api/mcp/route";
import { db } from "@/server/db";
import { registerClient } from "@/server/oauth/clients";
import { createAuthorizationCode, exchangeCode, revokeToken } from "@/server/oauth/grants";
import { makeApplication, makeUser } from "./factories";

const ORIGIN = "https://landed.test";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

beforeEach(async () => {
  await db.rateLimit.deleteMany();
});

async function tokenFor(userId: string, scopes: string[], resource = `${ORIGIN}/api/mcp`) {
  const { client_id } = await registerClient({ redirect_uris: ["https://c.example/cb"] });
  const code = await createAuthorizationCode({
    clientId: client_id, userId, redirectUri: "https://c.example/cb",
    codeChallenge: createHash("sha256").update(VERIFIER).digest("base64url"), scopes, resource,
  });
  return (await exchangeCode({ code, clientId: client_id, redirectUri: "https://c.example/cb", codeVerifier: VERIFIER })).access_token;
}

async function rpc(method: string, params: unknown, token?: string) {
  const res = await POST(new Request(`${ORIGIN}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }));
  const text = await res.text();
  const data = text.split("\n").find((l) => l.startsWith("data: "));
  return { res, body: data ? JSON.parse(data.slice(6)) : text ? JSON.parse(text) : null };
}

const call = (name: string, args: unknown, token: string) => rpc("tools/call", { name, arguments: args }, token);

test("no token: 401 pointing at the protected resource metadata", async () => {
  const { res } = await rpc("tools/list", {});
  expect(res.status).toBe(401);
  expect(res.headers.get("www-authenticate")).toContain(`resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp"`);
});

test("lists exactly the seven tools, with no delete", async () => {
  const u = await makeUser();
  const { body } = await rpc("tools/list", {}, await tokenFor(u.id, ["applications:read"]));
  expect(body.result.tools.map((t: { name: string }) => t.name).sort()).toEqual([
    "add_application", "add_timeline_entry", "change_status", "get_application",
    "pipeline_summary", "search_applications", "update_application",
  ]);
});

test("a read-only token can read but gets insufficient_scope on writes", async () => {
  const u = await makeUser();
  await makeApplication(u.id, { company: "Acme" });
  const token = await tokenFor(u.id, ["applications:read"]);
  const read = await call("search_applications", {}, token);
  expect(read.body.result.structuredContent.applications.map((a: { company: string }) => a.company)).toEqual(["Acme"]);
  const write = await call("add_application", { company: "B", title: "C" }, token);
  expect(write.res.status).toBe(403);
  expect(write.res.headers.get("www-authenticate")).toContain('error="insufficient_scope"');
  expect(await db.application.count({ where: { userId: u.id } })).toBe(1);
});

test("a read+write token adds applications for its own user only", async () => {
  const a = await makeUser();
  const b = await makeUser();
  const theirs = await makeApplication(a.id, { company: "A's secret" });
  const token = await tokenFor(b.id, ["applications:read", "applications:write"]);
  const added = await call("add_application", { company: "Stripe", title: "Engineer" }, token);
  expect(added.body.result.structuredContent).toMatchObject({ company: "Stripe" });
  expect(await db.application.count({ where: { userId: b.id } })).toBe(1);
  const peek = await call("get_application", { id: theirs.id }, token);
  expect(peek.body.result).toMatchObject({ isError: true, content: [{ text: "Application not found." }] });
  const poke = await call("change_status", { id: theirs.id, status: "REJECTED" }, token);
  expect(poke.body.result.isError).toBe(true);
  expect((await db.application.findUniqueOrThrow({ where: { id: theirs.id } })).status).toBe("SAVED");
});

test("invalid input comes back as a readable tool error", async () => {
  const u = await makeUser();
  const token = await tokenFor(u.id, ["applications:read", "applications:write"]);
  const { body } = await call("add_application", { company: "Acme", title: "x", companyDomain: "nope" }, token);
  expect(body.result).toMatchObject({ isError: true, content: [{ text: "Enter a website like acme.com" }] });
});

test("revoked tokens and tokens for another resource are refused", async () => {
  const u = await makeUser();
  const token = await tokenFor(u.id, ["applications:read"]);
  await revokeToken(token);
  expect((await rpc("tools/list", {}, token)).res.status).toBe(401);
  const other = await tokenFor(u.id, ["applications:read"], "https://other.test/api/mcp");
  expect((await rpc("tools/list", {}, other)).res.status).toBe(401);
});
