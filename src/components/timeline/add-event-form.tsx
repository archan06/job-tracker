"use client";

import { useRef, useState, useTransition } from "react";
import { useHydrated } from "@/components/forms/use-form-action";
import { useLocalToday } from "@/components/forms/use-local-today";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/field";
import { runAction } from "@/lib/run-action";
import { USER_EVENT_TYPES } from "@/lib/status";
import { EVENT_TYPE_LABELS } from "@/lib/timeline";
import { eventInputSchema } from "@/lib/validation/event";
import { parseForm, type FieldErrors } from "@/lib/validation/form";
import { addEventAction } from "@/server/actions/applications";

export function AddEventForm({ applicationId }: { applicationId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string>();
  const today = useLocalToday();
  const hydrated = useHydrated();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const local = parseForm(eventInputSchema, formData);
    if (!local.success) {
      setFieldErrors(local.fieldErrors);
      return;
    }
    setFieldErrors({});
    setError(undefined);
    startTransition(async () => {
      const result = await runAction(() => addEventAction(applicationId, { ok: true }, formData));
      if (result.ok) formRef.current?.reset();
      else {
        setFieldErrors(result.fieldErrors ?? {});
        setError(result.error);
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} method="post" noValidate className="flex flex-col gap-4">
      {error && <FormAlert>{error}</FormAlert>}
      <div className="grid gap-3 min-[380px]:grid-cols-2">
        <Field id="event-type" label="Type" error={fieldErrors.type}>
          <Select id="event-type" name="type" defaultValue="NOTE">
            {USER_EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EVENT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="event-date" label="Date" error={fieldErrors.date}>
          {/* Remounts once the local date is known so the default is right. */}
          <Input key={today} id="event-date" name="date" type="date" defaultValue={today} invalid={!!fieldErrors.date} />
        </Field>
      </div>
      <Field id="event-notes" label="Notes" error={fieldErrors.notes}>
        <Textarea
          id="event-notes"
          name="notes"
          rows={3}
          placeholder="What happened, who you talked to, next steps..."
          invalid={!!fieldErrors.notes}
        />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending || !hydrated} className="self-end">
        {pending ? "Adding..." : "Add to timeline"}
      </Button>
    </form>
  );
}
