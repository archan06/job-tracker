"use client";

import { useFormAction } from "@/components/forms/use-form-action";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/field";
import { registerSchema } from "@/lib/validation/auth";
import { validateWith } from "@/lib/validation/form";
import { registerAction } from "@/server/actions/auth";

const validate = validateWith(registerSchema);

export function RegisterForm() {
  const { formProps, pending, blocked, fieldErrors, error } = useFormAction(registerAction, validate);

  return (
    <form {...formProps} className="flex flex-col gap-4">
      {error && <FormAlert>{error}</FormAlert>}
      <Field id="name" label="Name" error={fieldErrors.name}>
        <Input id="name" name="name" autoComplete="name" required invalid={!!fieldErrors.name} />
      </Field>
      <Field id="email" label="Email" error={fieldErrors.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required invalid={!!fieldErrors.email} />
      </Field>
      <Field id="password" label="Password" error={fieldErrors.password} hint="At least 8 characters.">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          invalid={!!fieldErrors.password}
        />
      </Field>
      <Button type="submit" disabled={blocked} className="mt-1 w-full">
        {pending ? "Creating account..." : "Create account"}
      </Button>
    </form>
  );
}
