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
