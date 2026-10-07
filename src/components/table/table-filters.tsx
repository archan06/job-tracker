"use client";

import { CaretDown, FunnelSimple, MagnifyingGlass, X } from "@phosphor-icons/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { STATUS_STYLES } from "@/components/applications/status-styles";
import { controlClasses } from "@/components/ui/field";
import { SOURCES, SOURCE_LABELS, STATUSES, STATUS_LABELS, type ApplicationSource, type ApplicationStatus } from "@/lib/status";

export type FilterValues = {
  statuses: ApplicationStatus[];
  sources: ApplicationSource[];
  company: string;
  from: string;
  to: string;
  sort?: string;
  dir?: string;
};

function buildQuery(values: FilterValues) {
  const params = new URLSearchParams();
  if (values.statuses.length) params.set("status", values.statuses.join(","));
  if (values.sources.length) params.set("source", values.sources.join(","));
  if (values.company.trim()) params.set("company", values.company.trim());
  if (values.from) params.set("from", values.from);
  if (values.to) params.set("to", values.to);
  if (values.sort) params.set("sort", values.sort);
  if (values.dir) params.set("dir", values.dir);
  const query = params.toString();
  return query ? `?${query}` : "";
}

const labelClass = "text-xs font-medium text-muted";

export function TableFilters({ values }: { values: FilterValues }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [company, setCompany] = useState(values.company);
  const [expanded, setExpanded] = useState(false);
  // The last company search this component wrote to the URL.
  const lastSent = useRef(values.company);

  // A URL change we didn't make (Back, Clear filters, a link) resets the search box.
  useEffect(() => {
    if (values.company !== lastSent.current) {
      lastSent.current = values.company;
      setCompany(values.company);
    }
  }, [values.company]);

  // Discrete changes push a history entry so Back undoes them.
  function update(patch: Partial<FilterValues>) {
    startTransition(() => router.push(`${pathname}${buildQuery({ ...values, company, ...patch })}`, { scroll: false }));
  }

  // Typing replaces the entry instead of adding one per keystroke.
  useEffect(() => {
    // The URL stores the trimmed value, so "acme " already matches "acme".
    if (company.trim() === values.company) return;
    const timer = setTimeout(() => {
      lastSent.current = company.trim();
      startTransition(() => router.replace(`${pathname}${buildQuery({ ...values, company })}`, { scroll: false }));
    }, 300);
    return () => clearTimeout(timer);
  }, [company, values, pathname, router]);

  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  const activeCount =
    values.statuses.length + values.sources.length + (values.company ? 1 : 0) + (values.from ? 1 : 0) + (values.to ? 1 : 0);

  return (
    <div className="mb-5 rounded-xl border border-border bg-surface shadow-card">
      {/* Phones start with the filters folded away; wider screens always show them. */}
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="table-filters"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-text md:hidden"
      >
        <FunnelSimple size={16} className="text-muted" />
        Filters
        {activeCount > 0 && (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary-text tabular-nums">{activeCount}</span>
        )}
        <CaretDown size={14} className={`ml-auto text-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      <div id="table-filters" className={`${expanded ? "flex" : "hidden"} flex-col gap-4 border-t border-border p-4 md:flex md:border-t-0`}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,1fr)_auto_auto_auto]">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Company</span>
            <span className="relative">
              <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle" />
              <input
                type="search"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Search companies"
                className={`${controlClasses} h-10 pl-9`}
              />
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Source</span>
            <select
              value={values.sources[0] ?? ""}
              onChange={(e) => update({ sources: e.target.value ? [e.target.value as ApplicationSource] : [] })}
              className={`${controlClasses} h-10 pr-8`}
            >
              <option value="">All sources</option>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Applied from</span>
            <input type="date" value={values.from} max={values.to || undefined} onChange={(e) => update({ from: e.target.value })} className={`${controlClasses} h-10`} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Applied to</span>
            <input type="date" value={values.to} min={values.from || undefined} onChange={(e) => update({ to: e.target.value })} className={`${controlClasses} h-10`} />
          </label>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className={`${labelClass} mb-2`}>Status</legend>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => {
              const on = values.statuses.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => update({ statuses: toggle(values.statuses, s) })}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                    on ? `${STATUS_STYLES[s].badge} ring-1 ring-current/30` : "text-muted ring-1 ring-border hover:text-text"
                  }`}
                >
                  <span aria-hidden className={`size-1.5 rounded-full ${STATUS_STYLES[s].dot}`} />
                  {STATUS_LABELS[s]}
                </button>
              );
            })}
          </div>
        </fieldset>
        {(pending || activeCount > 0) && (
        <div className="flex min-h-8 items-center justify-between gap-3">
          <span aria-live="polite" className="text-xs text-subtle">
            {pending ? "Updating..." : ""}
          </span>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setCompany("");
                lastSent.current = "";
                update({ statuses: [], sources: [], company: "", from: "", to: "" });
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-primary-text hover:bg-surface-hover"
            >
              <X size={14} weight="bold" />
              Clear filters
            </button>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
