"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { authErrorMessage } from "@/lib/auth-errors";
import { safeCallbackPath } from "@/lib/callback-path";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { registerSchema } from "@/lib/validation/auth";
import { parseForm } from "@/lib/validation/form";
import { signIn, signOut } from "@/server/auth";
import { EmailTakenError } from "@/server/services/errors";
import { clientIp } from "@/server/client-ip";
import { emailSender } from "@/server/mail/sender";
import { requestNewLink, sendVerification } from "@/server/services/email-verification";
import { rateLimit } from "@/server/services/rate-limit";
import { registerUser } from "@/server/services/users";
import type { ActionResult } from "./types";

/** Credentials error codes the login form explains; anything else shows as a wrong email or password. */
const PASSED_THROUGH = new Set(["rate_limited", "unverified", "unverified_unsent"]);

async function signInWithPassword(email: string, password: string, redirectTo = "/board", token?: string): Promise<ActionResult> {
  try {
    await signIn("credentials", { email, password, redirectTo, ...(token ? { token } : {}) });
    return { ok: true };
  } catch (error) {
    // signIn redirects by throwing; only Auth.js errors are failures.
    if (error instanceof AuthError) {
      const code = error instanceof CredentialsSignin && PASSED_THROUGH.has(error.code) ? error.code : error.type;
      return { ok: false, error: authErrorMessage(code) ?? undefined };
    }
    throw error;
  }
}

export async function registerAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(registerSchema, formData);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.fieldErrors };
  // Without a way to send the link, the account could never be used.
  const sender = emailSender();
  if (!sender) return { ok: false, error: "Sign-up is temporarily unavailable" };
  const ip = clientIp(await headers());
  // Slows scripted sign-ups; each one costs a bcrypt hash and a database row.
  const { ok } = await rateLimit(`register:ip:${ip}`, 5, 60 * 60 * 1000);
  if (!ok) return { ok: false, error: "Too many sign-ups from this network. Try again in an hour." };
  let user: { id: string; email: string };
  try {
    user = await registerUser(parsed.data);
  } catch (error) {
    if (error instanceof EmailTakenError) return { ok: false, fieldErrors: { email: [error.message] } };
    throw error;
  }
  const sent = await sendVerification(user.id, ip, sender);
  redirect(`/check-email?email=${encodeURIComponent(user.email)}${sent === "sent" ? "" : "&limited=1"}`);
}

/** "Verify and sign in": the emailed link's token plus the account's password. */
export async function verifyAndSignInAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const token = String(formData.get("token") ?? "");
  if (!email || !password || !token) return { ok: false, error: "Enter your password." };
  return signInWithPassword(email, password, "/board", token);
}

/** "Resend email" and "Send a new link". Answers the same whatever the address, so it reveals nothing. */
export async function resendVerificationAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  if (email) await requestNewLink(email, clientIp(await headers()), emailSender());
  return { ok: true };
}

export async function loginAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { ok: false, error: "Enter your email and password." };
  return signInWithPassword(email, password, safeCallbackPath(formData.get("callbackUrl")?.toString()));
}

export async function googleSignInAction(formData: FormData): Promise<void> {
  await signIn("google", { redirectTo: safeCallbackPath(formData.get("callbackUrl")?.toString()) });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
