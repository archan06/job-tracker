"use client";

import { useState, type ReactNode } from "react";
import { CompanyLogo } from "@/components/company-logo";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Field, Input } from "@/components/ui/field";
import { normalizeDomain } from "@/lib/company-domain";
import type { CompanySuggestion } from "@/server/suggest/types";

type Props = {
  initialCompany: string;
  initialDomain: string;
  errors: Record<string, string[] | undefined>;
  /** Rendered between the company and website fields (the job title, in the form grid). */
  between?: ReactNode;
};

async function fetchCompanies(query: string, signal: AbortSignal): Promise<ComboboxOption<CompanySuggestion>[]> {
  const response = await fetch(`/api/suggest/company?q=${encodeURIComponent(query)}`, { signal });
  if (!response.ok) throw new Error(`suggest failed: ${response.status}`);
  const { suggestions } = (await response.json()) as { suggestions: CompanySuggestion[] };
  return suggestions.map((s, index) => ({
    id: `${s.source}-${s.domain ?? s.name}-${index}`,
    value: s.name,
    group: s.source === "recent" ? "Recent" : "Companies",
    data: s,
    render: (
      <>
        <CompanyLogo company={s.name} domain={s.domain} size="sm" />
        <span className="min-w-0 truncate">{s.name}</span>
        {s.domain && <span className="ml-auto shrink-0 text-xs text-muted">{s.domain}</span>}
      </>
    ),
  }));
}

/** Company name with suggestions, plus the website that keys its logo. Picking a suggestion fills both. */
export function CompanyField({ initialCompany, initialDomain, errors, between }: Props) {
  const [company, setCompany] = useState(initialCompany);
  const [website, setWebsite] = useState(initialDomain);
  // True while the website came from a picked suggestion, so editing the name can safely clear it.
  const [websiteAuto, setWebsiteAuto] = useState(false);
  const previewDomain = normalizeDomain(website);

  return (
    <>
      <Field id="company" label="Company" error={errors.company}>
        <Combobox
          id="company"
          name="company"
          autoComplete="off"
          value={company}
          invalid={!!errors.company}
          onValueChange={(next) => {
            setCompany(next);
            if (websiteAuto) {
              setWebsite("");
              setWebsiteAuto(false);
            }
          }}
          fetchOptions={fetchCompanies}
          onPick={(option) => {
            const picked = option.data!;
            setCompany(picked.name);
            if (picked.domain) {
              setWebsite(picked.domain);
              setWebsiteAuto(true);
            }
          }}
        />
      </Field>
      {between}
      <Field id="companyDomain" label="Company website" optional hint="Used to show the company logo." error={errors.companyDomain} className="sm:col-span-2">
        <div className="flex items-center gap-2.5">
          <Input
            id="companyDomain"
            name="companyDomain"
            inputMode="url"
            placeholder="acme.com"
            value={website}
            invalid={!!errors.companyDomain}
            onChange={(event) => {
              setWebsite(event.target.value);
              setWebsiteAuto(false);
            }}
          />
          {previewDomain && <CompanyLogo company={company || previewDomain} domain={previewDomain} size="md" />}
        </div>
      </Field>
    </>
  );
}
