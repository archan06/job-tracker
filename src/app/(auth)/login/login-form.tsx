"use client";

import { GoogleLogo } from "@phosphor-icons/react";
import { useFormAction } from "@/components/forms/use-form-action";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/field";
import { googleSignInAction, loginAction } from "@/server/actions/auth";

export function LoginForm({ googleEnabled, urlError, callbackUrl }: { googleEnabled: boolean; urlError: string | null; callbackUrl?: string }) {
  const { formProps, pending, blocked, error } = useFormAction(loginAction);
  const message = error ?? urlError;

  return (
    <div className="flex flex-col gap-5">
      {googleEnabled && (
        <>
          <form action={googleSignInAction}>
            {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}
            <Button type="submit" variant="secondary" className="w-full">
              <GoogleLogo size={18} weight="bold" />
              Continue with Google
            </Button>
          </form>
          <div className="flex items-center gap-3 text-xs text-subtle">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
      <form {...formProps} className="flex flex-col gap-4">
        {message && <FormAlert>{message}</FormAlert>}
        {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}
        <Field id="email" label="Email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field id="password" label="Password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Button type="submit" disabled={blocked} className="mt-1 w-full">
          {pending ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
