import type { Metadata } from "next";
import Link from "next/link";
import { ResendVerification } from "@/components/auth/resend-verification";
import { AuthCard } from "../auth-card";

export const metadata: Metadata = { title: "Check your inbox" };

export default async function CheckEmailPage(props: PageProps<"/check-email">) {
  const { email, limited } = await props.searchParams;
  const address = typeof email === "string" ? email : "";
  return (
    <AuthCard
      title="Check your inbox"
      subtitle="Confirm your email address to finish creating your account."
      footer={
        <>
          Already verified?{" "}
          <Link href="/login" className="font-medium text-primary-text hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm text-muted">
        <p>
          We sent a link to <span className="font-medium wrap-anywhere text-text">{address || "your email address"}</span>. Open it within 24 hours to
          verify your account.
        </p>
        {limited === "1" && <p className="font-medium text-text">We couldn&apos;t send another email right now. Try again in an hour.</p>}
        <p>Can&apos;t find it? Check your spam folder.</p>
        {address && <ResendVerification email={address} />}
      </div>
    </AuthCard>
  );
}
