"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { authErrorMessage } from "@/lib/auth-errors";
import { headers } from "next/headers";
import { registerSchema } from "@/lib/validation/auth";
import { parseForm } from "@/lib/validation/form";
import { signIn, signOut } from "@/server/auth";
import { EmailTakenError } from "@/server/services/errors";
import { clientIp } from "@/server/client-ip";
import { rateLimit } from "@/server/services/rate-limit";
import { registerUser } from "@/server/services/users";
import type { ActionResult } from "./types";

async function signInWithPassword(email: string, password: string): Promise<ActionResult> {
  try {
    await signIn("credentials", { email, password, redirectTo: "/board" });
    return { ok: true };
  } catch (error) {
    // signIn redirects by throwing; only Auth.js errors are failures.
    if (error instanceof AuthError) {
      const code = error instanceof CredentialsSignin && error.code === "rate_limited" ? error.code : error.type;
      return { ok: false, error: authErrorMessage(code) ?? undefined };
    }
    throw error;
  }
}

export async function registerAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(registerSchema, formData);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.fieldErrors };
  // Slows scripted sign-ups; each one costs a bcrypt hash and a database row.
  const { ok } = await rateLimit(`register:ip:${clientIp(await headers())}`, 5, 60 * 60 * 1000);
  if (!ok) return { ok: false, error: "Too many sign-ups from this network. Try again in an hour." };
  try {
    await registerUser(parsed.data);
  } catch (error) {
    if (error instanceof EmailTakenError) return { ok: false, fieldErrors: { email: [error.message] } };
    throw error;
  }
  return signInWithPassword(parsed.data.email, parsed.data.password);
}

export async function loginAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { ok: false, error: "Enter your email and password." };
  return signInWithPassword(email, password);
}

export async function googleSignInAction(): Promise<void> {
  await signIn("google", { redirectTo: "/board" });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
