import { NextRequest } from "next/server";
import { expect, test } from "vitest";
import { authConfig } from "@/server/auth.config";

const authorized = (url: string, method: string, signedIn: boolean) =>
  authConfig.callbacks.authorized({
    auth: signedIn ? { user: { id: "u1" }, expires: "2099-01-01" } : null,
    request: new NextRequest(new URL(url, "http://localhost"), { method }),
  } as Parameters<typeof authConfig.callbacks.authorized>[0]);

test("signed-in visitors opening /login or /register are sent to the board", () => {
  const result = authorized("/register", "GET", true);
  expect(result).toBeInstanceOf(Response);
  expect((result as Response).headers.get("location")).toBe("http://localhost/board");
});

test("form submissions to /login or /register are never redirected (a redirect breaks the action)", () => {
  expect(authorized("/register", "POST", true)).toBe(true);
  expect(authorized("/login", "POST", true)).toBe(true);
});

test("signed-out visitors can't open app pages", () => {
  expect(authorized("/board", "GET", false)).toBe(false);
  expect(authorized("/login", "GET", false)).toBe(true);
});

test("signed-out visitors can load the app icons (the login page uses them)", () => {
  expect(authorized("/apple-icon", "GET", false)).toBe(true);
  expect(authorized("/apple-iconic-page", "GET", false)).toBe(false);
});

test("suggestion API calls reach the route, which answers 401 itself instead of a login redirect", () => {
  expect(authorized("/api/suggest/company?q=acme", "GET", false)).toBe(true);
  expect(authorized("/api/suggestions-admin", "GET", false)).toBe(false);
});

test("OAuth, discovery and MCP endpoints reach their own handlers signed out", () => {
  for (const path of ["/oauth/authorize?client_id=x", "/oauth/token", "/oauth/register", "/.well-known/oauth-authorization-server", "/api/mcp"]) {
    expect(authorized(path, "GET", false)).toBe(true);
  }
  expect(authorized("/oauthish", "GET", false)).toBe(false);
});

test("a signed-in visitor on /login with a safe callbackUrl goes there instead of the board", () => {
  const result = authorized("/login?callbackUrl=%2Foauth%2Fauthorize%3Fclient_id%3Dx", "GET", true) as Response;
  expect(result.headers.get("location")).toBe("http://localhost/oauth/authorize?client_id=x");
  const evil = authorized("/login?callbackUrl=https%3A%2F%2Fevil.example", "GET", true) as Response;
  expect(evil.headers.get("location")).toBe("http://localhost/board");
});
