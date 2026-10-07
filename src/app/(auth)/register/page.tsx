import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "../auth-card";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <AuthCard
      title="Create your account"
      subtitle="Keep every application, interview and offer in one place."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary-text hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthCard>
  );
}
