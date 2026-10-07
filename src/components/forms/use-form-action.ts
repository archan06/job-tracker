"use client";

import { startTransition, useActionState, useState, useSyncExternalStore } from "react";
import type { ActionResult } from "@/server/actions/types";

const subscribe = () => () => {};

/** False until React has hydrated the page, so its submit handlers are attached. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

/**
 * Wraps a Server Action for a form. Submitting through onSubmit (instead of the
 * form's `action` prop) keeps what the user typed when the server returns errors,
 * and lets the same Zod schema reject bad input before a round trip.
 */
export function useFormAction(
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>,
  validate?: (formData: FormData) => ActionResult,
) {
  const [serverState, dispatch, pending] = useActionState(action, { ok: true } as ActionResult);
  const [clientState, setClientState] = useState<ActionResult | null>(null);
  // Fields the user has edited since the last submit; their old errors are hidden.
  const [edited, setEdited] = useState<ReadonlySet<string>>(new Set());
  const hydrated = useHydrated();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setEdited(new Set());
    const local = validate?.(formData);
    if (local && !local.ok) {
      setClientState(local);
      return;
    }
    setClientState(null);
    startTransition(() => dispatch(formData));
  }

  function onInput(event: React.FormEvent<HTMLFormElement>) {
    const name = (event.target as HTMLInputElement).name;
    if (name && !edited.has(name)) setEdited(new Set(edited).add(name));
  }

  const state = clientState ?? serverState;
  const allErrors = state.ok ? {} : (state.fieldErrors ?? {});
  const fieldErrors = Object.fromEntries(Object.entries(allErrors).filter(([name]) => !edited.has(name)));
  return {
    // method="post": a submit that beats hydration must never put fields (passwords) in the URL.
    formProps: { onSubmit, onInput, noValidate: true, method: "post" as const },
    pending,
    /** Disable submit buttons with this; before hydration the form can't run its handler. */
    blocked: pending || !hydrated,
    fieldErrors,
    error: state.ok ? undefined : state.error,
  };
}
