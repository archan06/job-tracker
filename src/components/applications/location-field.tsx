"use client";

import { useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Field } from "@/components/ui/field";
import { HYBRID_PREFIX, applyCityPick, cityQuery } from "@/lib/location";
import type { LocationSuggestion } from "@/server/suggest/types";

type Pick = { kind: "remote" | "hybrid" | "city"; label: string };

const QUICK_PICKS: ComboboxOption<Pick>[] = [
  { id: "remote", value: "Remote", data: { kind: "remote", label: "Remote" } },
  { id: "hybrid", value: "Hybrid…", data: { kind: "hybrid", label: HYBRID_PREFIX } },
];

async function fetchCities(query: string, signal: AbortSignal): Promise<ComboboxOption<Pick>[]> {
  const response = await fetch(`/api/suggest/location?q=${encodeURIComponent(query)}`, { signal });
  if (!response.ok) throw new Error(`suggest failed: ${response.status}`);
  const { suggestions } = (await response.json()) as { suggestions: LocationSuggestion[] };
  return suggestions.map(({ label }) => ({ id: label, value: label, data: { kind: "city", label } }));
}

/** Location with Remote / Hybrid quick picks and worldwide city suggestions. Free text still works. */
export function LocationField({ initial, errors }: { initial: string; errors?: string[] }) {
  const [value, setValue] = useState(initial);

  return (
    <Field id="location" label="Location" optional error={errors}>
      <Combobox
        id="location"
        name="location"
        autoComplete="off"
        placeholder="Remote, New York, ..."
        value={value}
        invalid={!!errors}
        onValueChange={setValue}
        staticOptions={(current) => (current.trim() === "" ? QUICK_PICKS : [])}
        queryFor={cityQuery}
        fetchOptions={fetchCities}
        onPick={(option) => {
          const pick = option.data!;
          setValue(pick.kind === "city" ? applyCityPick(value, pick.label) : pick.label);
        }}
        footer={
          <>
            Powered by{" "}
            <a href="https://www.geoapify.com" target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
              Geoapify
            </a>{" "}
            · ©{" "}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
              OpenStreetMap contributors
            </a>
          </>
        }
      />
    </Field>
  );
}
