import { z } from "zod";
import { parseDateOnly } from "@/lib/dates";

/** Form fields arrive as "" (or null when absent); treat both as "not provided". */
export function blankToUndefined(value: unknown) {
  if (value === null) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}

export const requiredText = (label: string, max: number) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

export const optionalText = (label: string, max: number) =>
  z.preprocess(
    blankToUndefined,
    z.string().trim().max(max, `${label} must be at most ${max} characters`).optional(),
  );

/** "YYYY-MM-DD" from a date input, parsed as UTC midnight. Date objects pass through. */
export const dateOnly = z.union([
  z.date(),
  z
    .string()
    .trim()
    .transform((value, ctx) => {
      try {
        return parseDateOnly(value);
      } catch {
        ctx.addIssue({ code: "custom", message: "Enter a valid date" });
        return z.NEVER;
      }
    }),
]);
