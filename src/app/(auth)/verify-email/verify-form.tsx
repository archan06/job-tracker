"use client";

import { useFormAction } from "@/components/forms/use-form-action";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/field";
import { verifyAndSignInAction } from "@/server/actions/auth";

/** The emailed link's token plus the account's password: proof of the inbox and of the account. */
export function VerifyForm({ email, token }: { email: string; token: string }) {
  const { formProps, pending, blocked, error } = useFormAction(verifyAndSignInAction);
  return (
    <form {...formProps} className="flex flex-col gap-4">
      {error && <FormAlert>{error}</FormAlert>}
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-muted">
        Verifying <span className="font-medium wrap-anywhere text-text">{email}</span>
      </p>
      <Field id="password" label="Password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" disabled={blocked} className="w-full">
        {pending ? "Verifying..." : "Verify and sign in"}
      </Button>
    </form>
  );
}
