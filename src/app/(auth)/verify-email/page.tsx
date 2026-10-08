import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { verifyEmailToken } from "@/server/services/email-verification";
import { AuthCard } from "../auth-card";
import { NewLinkForm } from "./new-link-form";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyEmailPage(props: PageProps<"/verify-email">) {
  // Verifying changes the database, so this always runs per request.
  await connection();
  const { token } = await props.searchParams;
  if (typeof token === "string" && token && (await verifyEmailToken(token))) redirect("/login?verified=1");
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
