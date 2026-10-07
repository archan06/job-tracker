import { z } from "zod";

export type FieldErrors = Record<string, string[] | undefined>;

export type FormParse<T> = { success: true; data: T } | { success: false; fieldErrors: FieldErrors };

/** Parses FormData with a Zod schema; used by Server Actions and, for instant feedback, by forms. */
export function parseForm<S extends z.ZodType>(schema: S, formData: FormData): FormParse<z.output<S>> {
  const result = schema.safeParse(Object.fromEntries(formData));
  if (result.success) return { success: true, data: result.data };
  return { success: false, fieldErrors: z.flattenError(result.error).fieldErrors as FieldErrors };
}

/** Client-side check for useFormAction. */
export function validateWith(schema: z.ZodType) {
  return (formData: FormData) => {
    const result = parseForm(schema, formData);
    return result.success ? ({ ok: true } as const) : ({ ok: false, fieldErrors: result.fieldErrors } as const);
  };
}
