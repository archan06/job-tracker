"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormNotice } from "@/components/ui/field";
import { resendVerificationAction } from "@/server/actions/auth";
import type { ActionResult } from "@/server/actions/types";

const COOLDOWN_SECONDS = 60;
export const NEW_LINK_SENT = "If that account needs verifying, we've sent a new link";

/** "Resend email" for an address already known; disabled for a minute after each click. */
export function ResendVerification({ email }: { email: string }) {
  const [, action, pending] = useActionState<ActionResult, FormData>(resendVerificationAction, { ok: true });
  const [sent, setSent] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  return (
    <form
      action={(formData) => {
        setSent(true);
        setWait(COOLDOWN_SECONDS);
        action(formData);
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="email" value={email} />
      {sent && !pending && <FormNotice>{NEW_LINK_SENT}.</FormNotice>}
      <Button type="submit" variant="secondary" disabled={pending || wait > 0} className="w-full">
        {pending ? "Sending..." : wait > 0 ? `Resend email (${wait}s)` : "Resend email"}
      </Button>
    </form>
  );
}
