import { expect, test } from "vitest";
import { authErrorMessage } from "@/lib/auth-errors";

test("maps Auth.js error codes to readable messages", () => {
  expect(authErrorMessage("CredentialsSignin")).toBe("Email or password is incorrect.");
  expect(authErrorMessage("OAuthAccountNotLinked")).toBe(
    "This email is already registered with a password. Sign in with your password instead.",
  );
  expect(authErrorMessage("rate_limited")).toBe("Too many sign-in attempts. Wait 15 minutes and try again.");
  expect(authErrorMessage(undefined)).toBeNull();
  expect(authErrorMessage("Weird")).toBe("Something went wrong signing you in. Please try again.");
});
