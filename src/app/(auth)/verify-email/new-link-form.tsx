"use client";

import { useActionState, useState } from "react";
import { NEW_LINK_SENT } from "@/components/auth/resend-verification";
import { Button } from "@/components/ui/button";
import { Field, FormNotice, Input } from "@/components/ui/field";
import { resendVerificationAction } from "@/server/actions/auth";
import type { ActionResult } from "@/server/actions/types";

export function NewLinkForm() {
  const [, action, pending] = useActionState<ActionResult, FormData>(resendVerificationAction, { ok: true });
  const [sent, setSent] = useState(false);
  return (
    <form
      action={(formData) => {
        setSent(true);
        action(formData);
      }}
      className="flex flex-col gap-4"
    >
      {sent && !pending && <FormNotice>{NEW_LINK_SENT}.</FormNotice>}
      <Field id="email" label="Email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending..." : "Send a new link"}
      </Button>
    </form>
  );
}
