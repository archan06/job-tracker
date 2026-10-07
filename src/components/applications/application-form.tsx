"use client";

import Link from "next/link";
import type { Application } from "@/generated/prisma/browser";
import { useFormAction } from "@/components/forms/use-form-action";
import { useLocalToday } from "@/components/forms/use-local-today";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/field";
import { toDateInputValue } from "@/lib/dates";
import { SOURCES, SOURCE_LABELS, STATUSES, STATUS_LABELS } from "@/lib/status";
import { applicationInputSchema } from "@/lib/validation/application";
import { validateWith } from "@/lib/validation/form";
import { createApplicationAction, updateApplicationAction } from "@/server/actions/applications";

const validate = validateWith(applicationInputSchema);

type Props = { mode: "create" } | { mode: "edit"; initial: Application };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-5 border-t border-border pt-6 first:border-t-0 first:pt-0 md:grid-cols-[12rem_1fr] md:gap-8">
      <h2 className="text-sm font-semibold text-text">{title}</h2>
      <div className="grid gap-5 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function ApplicationForm(props: Props) {
  const initial = props.mode === "edit" ? props.initial : null;
  const action = initial ? updateApplicationAction.bind(null, initial.id) : createApplicationAction;
  const { formProps, pending, blocked, fieldErrors, error } = useFormAction(action, validate);
  const cancelHref = initial ? `/applications/${initial.id}` : "/board";
  const today = useLocalToday();

  const text = (name: keyof Application) => {
    const value = initial?.[name];
    return typeof value === "string" ? value : "";
  };

  return (
    <form {...formProps} className="rounded-xl border border-border bg-surface p-5 shadow-card sm:p-8">
      <div className="flex flex-col gap-8">
        {error && <FormAlert>{error}</FormAlert>}
        {/* Used if this save marks it Applied without a date. */}
        <input type="hidden" name="clientToday" value={today} />

        <Section title="Role">
          <Field id="company" label="Company" error={fieldErrors.company}>
            <Input id="company" name="company" defaultValue={text("company")} autoComplete="organization" invalid={!!fieldErrors.company} />
          </Field>
          <Field id="title" label="Job title" error={fieldErrors.title}>
            <Input id="title" name="title" defaultValue={text("title")} invalid={!!fieldErrors.title} />
          </Field>
          <Field id="url" label="Job posting link" optional error={fieldErrors.url} className="sm:col-span-2">
            <Input id="url" name="url" inputMode="url" placeholder="https://" defaultValue={text("url")} invalid={!!fieldErrors.url} />
          </Field>
        </Section>

        <Section title="Progress">
          <Field id="status" label="Status" error={fieldErrors.status}>
            <Select id="status" name="status" defaultValue={initial?.status ?? "SAVED"}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="dateApplied" label="Date applied" optional error={fieldErrors.dateApplied} hint="Filled in automatically when you mark it Applied.">
            <Input
              id="dateApplied"
              name="dateApplied"
              type="date"
              defaultValue={initial?.dateApplied ? toDateInputValue(new Date(initial.dateApplied)) : ""}
              invalid={!!fieldErrors.dateApplied}
            />
          </Field>
          <Field id="source" label="Source" error={fieldErrors.source}>
            <Select id="source" name="source" defaultValue={initial?.source ?? "OTHER"}>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
        </Section>

        <Section title="Details">
          <Field id="location" label="Location" optional error={fieldErrors.location}>
            <Input id="location" name="location" placeholder="Remote, New York, ..." defaultValue={text("location")} invalid={!!fieldErrors.location} />
          </Field>
          <Field id="salaryRange" label="Salary range" optional error={fieldErrors.salaryRange}>
            <Input id="salaryRange" name="salaryRange" placeholder="$120k-$150k" defaultValue={text("salaryRange")} invalid={!!fieldErrors.salaryRange} />
          </Field>
          <Field id="description" label="Job description" optional error={fieldErrors.description} className="sm:col-span-2">
            <Textarea id="description" name="description" rows={6} defaultValue={text("description")} invalid={!!fieldErrors.description} />
          </Field>
          <Field id="notes" label="Notes" optional error={fieldErrors.notes} className="sm:col-span-2">
            <Textarea id="notes" name="notes" rows={3} defaultValue={text("notes")} invalid={!!fieldErrors.notes} />
          </Field>
        </Section>

        <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
          <Link href={cancelHref} className={buttonClasses("secondary")}>
            Cancel
          </Link>
          <Button type="submit" disabled={blocked}>
            {pending ? "Saving..." : initial ? "Save changes" : "Save application"}
          </Button>
        </div>
      </div>
    </form>
  );
}
