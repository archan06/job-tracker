import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { authErrorMessage } from "@/lib/auth-errors";
import { safeCallbackPath } from "@/lib/callback-path";
import { googleEnabled } from "@/server/auth.config";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthCard } from "../auth-card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

async function LoginFormWithUrlError({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { error, callbackUrl, verified } = await searchParams;
  return (
    <LoginForm
      googleEnabled={googleEnabled}
      notice={verified === "1" ? "Email verified. Sign in to continue." : null}
      urlError={authErrorMessage(typeof error === "string" ? error : undefined)}
      callbackUrl={typeof callbackUrl === "string" ? safeCallbackPath(callbackUrl) : undefined}
    />
  );
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to see your applications."
      footer={
        <>
          New here?{" "}
          <Link href="/register" className="font-medium text-primary-text hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {/* A skeleton, not a second copy of the form: anything typed into a placeholder form would be wiped when the real one streams in. */}
      <Suspense fallback={<Skeleton className="h-56 w-full rounded-lg" />}>
        <LoginFormWithUrlError searchParams={props.searchParams} />
      </Suspense>
    </AuthCard>
  );
}
