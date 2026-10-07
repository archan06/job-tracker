import { parseDateOnly, toDateInputValue } from "@/lib/dates";
import { SOURCES, STATUSES, type ApplicationSource, type ApplicationStatus } from "@/lib/status";
import type { ApplicationFilters, ApplicationSort } from "@/server/services/applications";

type RawParams = Record<string, string | string[] | undefined>;

/** Filters plus the page number; page is left out when it's 1. */
export type TableQuery = ApplicationFilters & { page?: number };

const SORTS: readonly ApplicationSort[] = ["company", "title", "status", "dateApplied", "updatedAt"];
export const DEFAULT_SORT: ApplicationSort = "updatedAt";
export const DEFAULT_DIR = "desc";

/** Accepts `?status=A&status=B` and `?status=A,B`; unknown values are dropped. */
function list<T extends string>(raw: string | string[] | undefined, allowed: readonly T[]): T[] | undefined {
  const values = (Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap((v) => v.split(","));
  const valid = values.filter((v): v is T => allowed.includes(v as T));
  return valid.length ? [...new Set(valid)] : undefined;
}

function single(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() || undefined;
}

function date(raw: string | string[] | undefined): Date | undefined {
  const value = single(raw);
  if (!value) return undefined;
  try {
    return parseDateOnly(value);
  } catch {
    return undefined;
  }
}

/** Turns the table page's URL search params into service filters. Anything invalid falls back to defaults. */
export function parseTableQuery(params: RawParams): TableQuery {
  const filters: TableQuery = {};
  const statuses = list<ApplicationStatus>(params.status, STATUSES);
  const sources = list<ApplicationSource>(params.source, SOURCES);
  const company = single(params.company);
  const appliedFrom = date(params.from);
  const appliedTo = date(params.to);
  if (statuses) filters.statuses = statuses;
  if (sources) filters.sources = sources;
  if (company) filters.company = company;
  if (appliedFrom) filters.appliedFrom = appliedFrom;
  if (appliedTo) filters.appliedTo = appliedTo;
  const sort = single(params.sort);
  const dir = single(params.dir);
  filters.sort = SORTS.includes(sort as ApplicationSort) ? (sort as ApplicationSort) : DEFAULT_SORT;
  filters.dir = dir === "asc" || dir === "desc" ? dir : DEFAULT_DIR;
  const page = Number(single(params.page));
  if (Number.isInteger(page) && page > 1) filters.page = page;
  return filters;
}

/** The reverse of parseTableQuery, leaving out defaults so URLs stay short. */
export function toSearchParams(filters: TableQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.statuses?.length) params.set("status", filters.statuses.join(","));
  if (filters.sources?.length) params.set("source", filters.sources.join(","));
  if (filters.company) params.set("company", filters.company);
  if (filters.appliedFrom) params.set("from", toDateInputValue(filters.appliedFrom));
  if (filters.appliedTo) params.set("to", toDateInputValue(filters.appliedTo));
  if (filters.sort && filters.sort !== DEFAULT_SORT) params.set("sort", filters.sort);
  if (filters.dir && filters.dir !== DEFAULT_DIR) params.set("dir", filters.dir);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  return params;
}
