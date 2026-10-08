import { expect, test } from "vitest";
import { authConfig } from "@/server/auth.config";

type Callbacks = {
  jwt: (p: { token: Record<string, unknown>; user?: Record<string, unknown> }) => Record<string, unknown>;
  session: (p: { session: { user: Record<string, unknown> }; token: Record<string, unknown> }) => { user: Record<string, unknown> };
};
const { jwt, session } = authConfig.callbacks as unknown as Callbacks;
const blank = () => ({ user: { name: "A", email: "a@example.com" } });

test("session callback hides the user id for tokens without verified", () => {
  expect(session({ session: blank(), token: { sub: "u1" } }).user.id).toBeUndefined();
  expect(session({ session: blank(), token: { sub: "u1", verified: false } }).user.id).toBeUndefined();
  expect(session({ session: blank(), token: { sub: "u1", verified: true } }).user.id).toBe("u1");
});

test("jwt callback records verified from the user", () => {
  expect(jwt({ token: {}, user: { id: "u1", emailVerified: new Date() } })).toMatchObject({ sub: "u1", verified: true });
  expect(jwt({ token: {}, user: { id: "u1", emailVerified: null } })).toMatchObject({ sub: "u1", verified: false });
  expect(jwt({ token: { sub: "u1", verified: true } })).toMatchObject({ sub: "u1", verified: true });
});
