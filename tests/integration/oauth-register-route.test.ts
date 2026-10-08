import { beforeEach, expect, test } from "vitest";
import { POST } from "@/app/oauth/register/route";
import { db } from "@/server/db";

beforeEach(async () => {
  await db.rateLimit.deleteMany();
});

const register = (body: unknown, ip = "203.0.113.7") =>
  POST(new Request("http://localhost/oauth/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));

test("registers with 201 and JSON, no-store", async () => {
  const res = await register({ client_name: "Claude", redirect_uris: ["https://claude.ai/cb"] });
  expect(res.status).toBe(201);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect((await res.json()).client_id).toBeTruthy();
});

test("bad JSON and bad metadata get 400 invalid_client_metadata", async () => {
  expect((await (await register("{nope")).json()).error).toBe("invalid_client_metadata");
  const res = await register({ redirect_uris: ["http://evil.example/cb"] });
  expect(res.status).toBe(400);
  expect((await res.json()).error).toBe("invalid_client_metadata");
});

test("20 registrations per hour per network, then 429", async () => {
  for (let i = 0; i < 20; i++) expect((await register({ redirect_uris: ["https://ok.example/cb"] })).status).toBe(201);
  expect((await register({ redirect_uris: ["https://ok.example/cb"] })).status).toBe(429);
  expect((await register({ redirect_uris: ["https://ok.example/cb"] }, "198.51.100.9")).status).toBe(201);
});
