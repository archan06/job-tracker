import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { findVerificationEmail } from "@/server/services/email-verification";
import { AuthCard } from "../auth-card";
import { NewLinkForm } from "./new-link-form";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyEmailPage(props: PageProps<"/verify-email">) {
  // Every link is different, so this always runs per request. Opening it changes nothing (email scanners open links
  // too); the account is verified only when the password is entered below.
  await connection();
  const { token } = await props.searchParams;
  const email = typeof token === "string" && token ? await findVerificationEmail(token) : null;
  if (email && typeof token === "string") {
    return (
      <AuthCard
        title="Verify and sign in"
        subtitle="Enter your password to confirm this is your account."
        footer={
          <>
            Not you?{" "}
            <Link href="/register" className="font-medium text-primary-text hover:underline">
              Create an account
            </Link>
          </>
        }
      >
        <VerifyForm email={email} token={token} />
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title="This link has expired"
      subtitle="Verification links work for 24 hours. Enter your email and we'll send a new one."
      footer={
        <>
          Already verified?{" "}
          <Link href="/login" className="font-medium text-primary-text hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <NewLinkForm />
    </AuthCard>
  );
}
