import { z } from "zod";
import { normalizeDomain } from "@/lib/company-domain";
import { ApplicationSource, ApplicationStatus } from "@/lib/status";
import { blankToUndefined, dateOnly, optionalText, requiredText } from "./fields";

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
// "javascript:", "mailto:" etc. Excludes "host:8080/path", where a digit follows the colon.
const OPAQUE_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d)/i;

/** Accepts pasted URLs without "https://" and rejects anything that isn't http(s). */
const jobUrl = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .max(2048, "URL must be at most 2048 characters")
    .transform((value) => (HAS_SCHEME.test(value) || OPAQUE_SCHEME.test(value) ? value : `https://${value}`))
    .refine((value) => {
      try {
        const { protocol, hostname } = new URL(value);
        return (protocol === "http:" || protocol === "https:") && hostname.length > 0;
      } catch {
        return false;
      }
    }, "Enter a valid web address")
    .optional(),
);

/** The company's website, stored as a bare domain so it can key the logo. */
const companyDomain = z.preprocess(
  blankToUndefined,
  z
    .string()
    .max(2048, "Enter a website like acme.com")
    .transform((value, ctx) => {
      const domain = normalizeDomain(value);
      if (domain) return domain;
      ctx.addIssue({ code: "custom", message: "Enter a website like acme.com" });
      return z.NEVER;
    })
    .optional(),
);

export const applicationInputSchema = z.object({
  company: requiredText("Company", 100),
  title: requiredText("Job title", 150),
  url: jobUrl,
  companyDomain,
  location: optionalText("Location", 100),
  salaryRange: optionalText("Salary range", 50),
  status: z.preprocess(blankToUndefined, z.enum(ApplicationStatus).default("SAVED")),
  source: z.preprocess(blankToUndefined, z.enum(ApplicationSource).default("OTHER")),
  dateApplied: z.preprocess(blankToUndefined, dateOnly.optional()),
  description: optionalText("Description", 10_000),
  notes: optionalText("Notes", 5_000),
});

export type ApplicationInput = z.output<typeof applicationInputSchema>;
