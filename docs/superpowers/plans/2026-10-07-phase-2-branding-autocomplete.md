# Phase 2: Landed Branding and Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the app as Landed, add company suggestions with logos, and add city/Remote/Hybrid location suggestions.

**Architecture:** The browser calls the app's own `/api/suggest/company` and `/api/suggest/location` routes. A shared handler does the session check, query validation and rate limiting, then calls a service that merges the user's past companies with a provider (Logo.dev or Geoapify) behind a small interface. Provider calls are cached with `'use cache'`. Logos render client-side from the saved `companyDomain` through the Logo.dev image CDN, falling back to an initials avatar.

**Tech Stack:** Next.js 16.4 (App Router, `cacheComponents: true`), React 19.3, Prisma 7 + Postgres, Auth.js v5, Zod 4, Tailwind 4, Vitest 5, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-phase-2-branding-autocomplete-design.md`

## Global Constraints

- Read `node_modules/next/dist/docs/` before writing Next code (AGENTS.md). In particular, `'use cache'` can't go directly in a route handler body; put it in a helper function and pair it with `cacheLife`.
- Brand name is exactly `Landed`. Page title template is `%s | Landed`.
- Env vars: `LOGO_DEV_SECRET_KEY` (server only), `NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY` (browser), `GEOAPIFY_API_KEY` (server only), `SUGGEST_PROVIDER` (`fake` in end-to-end tests only).
- Logo.dev search: `GET https://api.logo.dev/v2/search?q={q}&limit=8&method=typeahead` with header `Authorization: Bearer {secret}`. The response is `{ data: [{ name, domain, logo_url }] }`. Use `typeahead`, because the default `match` returns "STRI" instead of "Stripe" for `stri`.
- Logo.dev image: `https://img.logo.dev/{domain}?token={publishable}&size={px}&retina=true&format=webp&fallback=404`.
- Geoapify: `GET https://api.geoapify.com/v1/geocode/autocomplete?text={q}&type=city&format=json&limit=6&apiKey={key}`. The response is `{ results: [{ city, state, state_code, country, country_code, formatted }] }`.
- Query length: 2-100 characters after trimming. Rate limit: 120 per minute per user, key `suggest:{userId}`. Provider timeout: 3000 ms. Cache: `cacheLife("days")`.
- Results: at most 5 recent companies, at most 8 companies in total, at most 6 cities.
- Hybrid prefix is exactly `Hybrid · ` (U+00B7 middle dot with a space on each side).
- Copy: website hint `Used to show the company logo.`; website error `Enter a website like acme.com`; logo credit `Logos provided by Logo.dev`; location footer `Powered by Geoapify · © OpenStreetMap contributors`.
- Suggestions never block saving. Every field submits its typed text.
- Every route response sends `Cache-Control: private, no-store`.

## Review Focus

1. **Enter while the suggestion list is open** must pick the option, not submit the form. Pinned by the e2e in Task 6.
2. **Wildcards in search text** (`%`, `_`) must not match every past company. Pinned by an integration test in Task 4 (escape them if Prisma doesn't).
3. **Clearing the Company website on edit** must save `null`, so the logo reverts to initials. Pinned by an integration test in Task 2.
4. **Provider data that's messy** (uppercase domains, blank or invalid domains, duplicate cities) must be cleaned or dropped, not shown. Pinned by unit tests in Task 4.
5. **Hybrid prefix edge cases** (`Hybrid · ` with 0-1 characters after it, or the prefix partly deleted) must not search or crash. Pinned by unit tests in Task 7.

---

### Task 1: Landed branding

**Files:**
- Modify: `src/components/brand.tsx`, `src/app/layout.tsx:17`, `src/app/(app)/layout.tsx:22`, `README.md`
- Create: `src/components/brand-mark.tsx`, `src/app/icon.svg`, `src/app/apple-icon.tsx`
- Read first: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/app-icons.md`

**Interfaces:**
- Produces: `BrandMark({ size }: { size?: number })`, an inline SVG using `currentColor`.

- [ ] **Step 1: Create `BrandMark`.** `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `strokeWidth={2.25}`, round caps and joins, `aria-hidden`. Two paths: a horizon line `M4 19.5h16` and a check `M6.5 11.5l3.75 3.75L18 7.5`.
- [ ] **Step 2: Update `Brand`.** Replace `<Briefcase />` with `<BrandMark size={18} />` inside the existing `bg-primary` square, and change the text to `Landed`.
- [ ] **Step 3: Update metadata.** Root metadata becomes `title: { default: "Landed", template: "%s | Landed" }` with `description: "Track every job application from saved to offer."`. The app layout home link becomes `aria-label="Landed home"`.
- [ ] **Step 4: Add icons.** `src/app/icon.svg`: the same two paths in white on a 32×32 rounded rect (`rx="8"`) filled with `#2563eb` (blue-600, the light `--primary`). `src/app/apple-icon.tsx`: `ImageResponse` at 180×180 with the same design, following the app-icons doc. Delete `src/app/favicon.ico` if it exists, so it doesn't override `icon.svg`.
- [ ] **Step 5: Update the README.** Title `# Landed`, plus a one-line intro.
- [ ] **Step 6: Verify.**
  - Run: `grep -rn "Job Tracker" src README.md`. Expected: no output.
  - Run: `npm run lint && npx next build`. Expected: both succeed, and the build output lists `/icon.svg` and `/apple-icon`.
- [ ] **Step 7: Commit.** `git commit -m "feat: rebrand as Landed with logo mark and app icons"`

---

### Task 2: `companyDomain` field

**Files:**
- Create: `src/lib/company-domain.ts`, migration `prisma/migrations/<timestamp>_company_domain/migration.sql` (via `npx prisma migrate dev --name company_domain`)
- Modify: `prisma/schema.prisma` (Application), `src/lib/validation/application.ts`, `src/server/services/applications.ts` (`fieldsFrom`, `SUMMARY_SELECT`, `listBoard` select), `src/lib/board.ts` (`BoardCard`), `tests/integration/factories.ts` (only if types require it)
- Test: `tests/unit/company-domain.test.ts`, `tests/integration/applications.test.ts`

**Interfaces:**
- Produces:
  - `normalizeDomain(input: string): string | null`, which returns `null` for anything invalid.
  - `ApplicationInput.companyDomain?: string`
  - `Application.companyDomain: string | null`
  - `BoardCard.companyDomain: string | null`
  - `ApplicationSummary` includes `companyDomain`.

- [ ] **Step 1: Write the failing unit tests.**

```ts
test.each([
  ["stripe.com", "stripe.com"],
  ["https://www.Stripe.com/jobs?x=1#y", "stripe.com"],
  ["  ACME.io  ", "acme.io"],
  ["http://user:pw@jobs.acme.co.uk:8080/path", "jobs.acme.co.uk"],
  ["www.example.org", "example.org"],
])("normalizes %s", (input, expected) => expect(normalizeDomain(input)).toBe(expected));

test.each(["localhost", "not a site", "javascript:alert(1)", "acme", "-bad.com", "a..com", "acme.c", "", `${"a".repeat(64)}.com`])(
  "rejects %s", (input) => expect(normalizeDomain(input)).toBeNull(),
);

test("schema normalizes, treats blank as undefined, and reports the error copy", () => {
  const base = { company: "Acme", title: "Engineer" };
  expect(applicationInputSchema.parse({ ...base, companyDomain: "https://www.acme.io/" }).companyDomain).toBe("acme.io");
  expect(applicationInputSchema.parse({ ...base, companyDomain: "  " }).companyDomain).toBeUndefined();
  const bad = applicationInputSchema.safeParse({ ...base, companyDomain: "nope" });
  expect(bad.success).toBe(false);
  expect(bad.error!.issues[0].message).toBe("Enter a website like acme.com");
});
```

- [ ] **Step 2: Run the tests.** Run: `npx vitest run --project unit tests/unit/company-domain.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `normalizeDomain`.** Lowercase and trim. If there's no scheme, prefix `https://`. Parse with `new URL`, reject a protocol other than http(s), take `hostname`, and strip a leading `www.`. Validate the result against the spec's hostname rules: total length ≤ 253, at least 2 labels, each label matches `/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/`, and the TLD matches `/^[a-z]{2,}$/`. Add `companyDomain` to `applicationInputSchema` using `z.preprocess(blankToUndefined, …)` with a transform that returns the normalized value, or adds a custom issue with the error copy.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Write the failing integration tests** in `tests/integration/applications.test.ts`:

```ts
test("companyDomain is saved normalized, shown in lists and on the board, and cleared by a blank edit", async () => {
  const user = await makeUser();
  const app = await makeApplication(user.id, { companyDomain: "stripe.com" });
  expect(app.companyDomain).toBe("stripe.com");
  expect((await listApplications(user.id))[0].companyDomain).toBe("stripe.com");
  expect((await listBoard(user.id)).columns.SAVED[0].companyDomain).toBe("stripe.com");
  const input = applicationInputSchema.parse({ company: "Stripe", title: "Engineer", companyDomain: "" });
  expect((await updateApplication(user.id, app.id, input)).companyDomain).toBeNull();
});
```

- [ ] **Step 6: Add the column and persist it.** Add `companyDomain String?` to `Application` and run `npx prisma migrate dev --name company_domain`. Add `companyDomain: input.companyDomain ?? null` to `fieldsFrom`, `companyDomain: true` to `SUMMARY_SELECT` and the `listBoard` select, and `companyDomain: string | null` to `BoardCard`.
- [ ] **Step 7: Run the tests.** Run: `npm test && npm run test:integration`. Expected: all pass, and `npx tsc --noEmit` is clean.
- [ ] **Step 8: Commit.** `git commit -m "feat: store a normalized company website on applications"`

---

### Task 3: `CompanyLogo` everywhere

**Files:**
- Create: `src/lib/company-avatar.ts`, `src/lib/logo.ts`, `src/components/company-logo.tsx`
- Modify: `src/app/globals.css` (avatar tokens, light and `.dark`), `src/components/board/application-card.tsx`, `src/components/table/applications-table.tsx`, `src/app/(app)/applications/[id]/page.tsx`, `src/app/(app)/layout.tsx` (credit)
- Test: `tests/unit/company-avatar.test.ts`

**Interfaces:**
- Consumes: `BoardCard.companyDomain` and `ApplicationSummary.companyDomain` (Task 2).
- Produces:
  - `initials(company: string): string`
  - `avatarColor(company: string): number`, which returns 1-8.
  - `logoUrl(domain: string, px: number): string | null`, which returns `null` when there's no publishable key.
  - `CompanyLogo({ company, domain, size }: { company: string; domain: string | null; size: "sm" | "md" | "lg" })`, a client component. Sizes are sm 20, md 24 and lg 40 px. The root element has `data-testid="company-logo"` and `data-domain={domain ?? ""}`.

- [ ] **Step 1: Write the failing unit tests.**

```ts
test.each([["Acme Corp", "AC"], ["stripe", "S"], ["  open   ai labs ", "OA"], ["Ünïcode Co", "ÜC"], ["東京 Tech", "東T"], ["🚀", "?"], ["", "?"], ["(—)", "?"]])(
  "initials(%s) = %s", (name, expected) => expect(initials(name)).toBe(expected),
);
test("avatarColor is stable, case-insensitive and in 1..8", () => {
  expect(avatarColor("Acme")).toBe(avatarColor("acme"));
  for (const n of ["a", "Stripe", "東京", "🚀", ""]) expect(avatarColor(n)).toBeGreaterThanOrEqual(1), expect(avatarColor(n)).toBeLessThanOrEqual(8);
});
test("logoUrl builds the CDN URL, or null without a key", () => {
  vi.stubEnv("NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY", "pk_test");
  expect(logoUrl("stripe.com", 20)).toBe("https://img.logo.dev/stripe.com?token=pk_test&size=20&retina=true&format=webp&fallback=404");
  vi.stubEnv("NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY", "");
  expect(logoUrl("stripe.com", 20)).toBeNull();
});
```

- [ ] **Step 2: Run the tests.** Run: `npx vitest run --project unit tests/unit/company-avatar.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the helpers.**
  - `initials`: take the first letter or number (`\p{L}|\p{N}`) of the first two whitespace-separated words that have one, uppercased, otherwise `?`.
  - `avatarColor`: a simple string hash (e.g. FNV-1a) of the lowercased trimmed name, mod 8, plus 1.
  - `logoUrl`: reads `process.env.NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY` at call time and uses `URLSearchParams` in the pinned order.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Add avatar tokens and `CompanyLogo`.**
  - Add `--avatar-{1..8}-bg` / `--avatar-{1..8}-fg` to `:root` and `.dark`, using the hues blue, violet, emerald, amber, rose, cyan, lime and fuchsia. Light uses `-100` bg and `-800` fg. Dark uses an `oklch(0.3 0.07 <hue>)` bg and `-200` fg.
  - `CompanyLogo` renders a rounded-full square with fixed width and height. If `logoUrl` is non-null and the image hasn't failed, it renders `<img alt="" loading="lazy" width height>` with `onError` flipping to initials. Otherwise it renders initials (`text-[0.45em] font-semibold`, scaled to the size) on the avatar color. Reset the failed state when `domain` changes. Use a plain `<img>` (disable `@next/next/no-img-element` for that line with a comment: the CDN already resizes).
- [ ] **Step 6: Place logos and the credit.**
  - Board `CardBody`: `sm` logo in a `flex items-center gap-2` row before the company link (the overlay variant too).
  - Table: `sm` logo in the desktop company cell and the mobile card.
  - Detail header: `lg` logo before the `<h1>`.
  - App layout: a small `text-xs text-subtle` footer under `<main>`, above the bottom tab bar padding, with `<a href="https://logo.dev">Logos provided by Logo.dev</a>`.
- [ ] **Step 7: Verify.** Run: `npm run lint && npx tsc --noEmit && npm test`. Expected: clean. Then run `npm run dev`, give a seed application `companyDomain` "stripe.com" (edit it in Prisma Studio or SQL), and check the board in light and dark mode: the Stripe logo shows, others show initials, and the layout doesn't shift.
- [ ] **Step 8: Commit.** `git commit -m "feat: show company logos with initials fallback"`

---

### Task 4: Suggestion providers and services

**Files:**
- Create:
  - `src/server/suggest/types.ts`
  - `src/server/suggest/logo-dev.ts`
  - `src/server/suggest/geoapify.ts`
  - `src/server/suggest/fake.ts`
  - `src/server/suggest/directories.ts`
  - `src/server/services/suggestions.ts`
  - `src/lib/location.ts` (`formatCityLabel` only; Task 7 adds more)
- Modify: `.env.example`
- Test: `tests/unit/suggest-providers.test.ts`, `tests/unit/suggestions-merge.test.ts`, `tests/integration/suggestions.test.ts`

**Interfaces:**
- Consumes: `normalizeDomain` (Task 2).
- Produces (all exact):

```ts
// types.ts
export type CompanySuggestion = { name: string; domain: string | null; source: "recent" | "directory" };
export type LocationSuggestion = { label: string };
export interface CompanyDirectory { search(query: string, signal?: AbortSignal): Promise<{ name: string; domain: string }[]> }
export interface PlaceDirectory { searchCities(query: string, signal?: AbortSignal): Promise<LocationSuggestion[]> }
// logo-dev.ts / geoapify.ts
export function logoDevDirectory(secretKey: string, fetchImpl?: typeof fetch): CompanyDirectory
export function geoapifyDirectory(apiKey: string, fetchImpl?: typeof fetch): PlaceDirectory
// fake.ts
export const fakeCompanyDirectory: CompanyDirectory; export const fakePlaceDirectory: PlaceDirectory
// directories.ts — what routes use; picks fake / disabled / real from env and wraps real calls in 'use cache'
export function companyDirectory(): CompanyDirectory; export function placeDirectory(): PlaceDirectory
// lib/location.ts
export function formatCityLabel(r: { city?: string; state?: string; state_code?: string; country?: string }): string | null
// services/suggestions.ts
export const PROVIDER_TIMEOUT_MS = 3000;
export function mergeCompanySuggestions(recent: { name: string; domain: string | null }[], directory: { name: string; domain: string }[]): CompanySuggestion[]
export async function suggestCompanies(userId: string, query: string, directory: CompanyDirectory): Promise<CompanySuggestion[]>
export async function suggestLocations(query: string, directory: PlaceDirectory): Promise<LocationSuggestion[]>
```

- [ ] **Step 1: Write the failing unit tests.**
  - `suggest-providers.test.ts`, using a stub `fetchImpl` that records the URL and init:
    - `logoDevDirectory("sk_x", stub).search("stri")` requests `https://api.logo.dev/v2/search?q=stri&limit=8&method=typeahead` with header `Authorization: Bearer sk_x`, and maps `{ data: [{ name: "Stripe", domain: "STRIPE.com" }, { name: "Bad", domain: "" }, { name: "Junk", domain: "not a domain" }] }` to `[{ name: "Stripe", domain: "stripe.com" }]`.
    - A non-2xx response makes `search` reject.
    - `geoapifyDirectory("k", stub).searchCities("tor")` requests the pinned URL (with `text=tor`) and maps two results that both format to `Toronto, ON, Canada`, plus one with no `city`, to `[{ label: "Toronto, ON, Canada" }]`.
    - `formatCityLabel`: `{city:"Toronto",state:"Ontario",state_code:"ON",country:"Canada"}` gives `Toronto, ON, Canada`. Without `state_code` it gives `Paris, Île-de-France, France`. Without a state it gives `Singapore, Singapore`. Without a city it gives `null`.
  - `suggestions-merge.test.ts`:

```ts
test("recent first, directory deduped by domain, name match fills a missing domain, max 8", () => {
  const out = mergeCompanySuggestions(
    [{ name: "Stripe", domain: null }, { name: "Acme", domain: "acme.io" }],
    [{ name: "stripe", domain: "stripe.com" }, { name: "Acme Inc", domain: "ACME.io" }, ...Array.from({ length: 10 }, (_, i) => ({ name: `Co${i}`, domain: `co${i}.com` }))],
  );
  expect(out.slice(0, 2)).toEqual([{ name: "Stripe", domain: "stripe.com", source: "recent" }, { name: "Acme", domain: "acme.io", source: "recent" }]);
  expect(out.filter((s) => s.domain === "acme.io")).toHaveLength(1);
  expect(out).toHaveLength(8);
});
```

- [ ] **Step 2: Run the tests.** Run: `npx vitest run --project unit tests/unit/suggest-providers.test.ts tests/unit/suggestions-merge.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the providers, `formatCityLabel`, the fakes and `mergeCompanySuggestions`.**
  - Directory domains go through `normalizeDomain`, and entries where it returns `null` are dropped.
  - The fakes filter fixed lists by case-insensitive `includes`:
    - Companies: `Stripe/stripe.com`, `Playwright Inc/playwright.dev`, `Shopify/shopify.com`, `Spotify/spotify.com`.
    - Cities: `Toronto, ON, Canada`, `Torrance, CA, United States`, `New York, NY, United States`, `Torino, Piedmont, Italy`.
  - `directories.ts`:
    - `SUGGEST_PROVIDER === "fake"` gives the fakes.
    - A missing key gives a directory that returns `[]`.
    - Otherwise it calls module-level helpers `cachedCompanySearch(q)` / `cachedCitySearch(q)`, which start with `'use cache'`, call `cacheLife("days")`, and call the real directory with `AbortSignal.timeout(PROVIDER_TIMEOUT_MS)`.
    - The query is normalized (trimmed, lowercased) before the cached call.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Write the failing integration tests** (`tests/integration/suggestions.test.ts`, using `makeUser` / `makeApplication`):
  - **Recent and scoped:** user A has `Acme Secret` (`acme.io`). User B has `Acme Rockets` (no domain) and `Beta`. `suggestCompanies(B, "acme", emptyDir)` returns exactly `[{ name: "Acme Rockets", domain: null, source: "recent" }]`.
  - **Latest domain, one row per name:** user B has two `Globex` applications, one older with `globex.com` and one newer with no domain. The result has one `Globex` row with `globex.com`, and recent results are capped at 5 (create 7 matching companies).
  - **Wildcards:** user B has `Acme`. `suggestCompanies(B, "%%", emptyDir)` and `"__"` return `[]`.
  - **Provider failure:** `suggestCompanies` with a directory whose `search` rejects still returns the recent rows. So does one whose `search` never resolves, and that call finishes in under `PROVIDER_TIMEOUT_MS + 1000` ms. `suggestLocations` with a rejecting directory returns `[]`.
- [ ] **Step 6: Implement the services.**
  - Recent query: `db.application.findMany({ where: { userId, company: { contains: q, mode: "insensitive" } }, orderBy: { updatedAt: "desc" }, select: { company: true, companyDomain: true }, take: 50 })`. Collapse by lowercased name, keeping the first non-null domain, and keep the first 5 names.
  - If the wildcard test fails, escape `\`, `%` and `_` in `q` before `contains`.
  - Provider calls race a `PROVIDER_TIMEOUT_MS` timer. Errors and timeouts are caught, logged with `console.warn("suggest provider failed", error)`, and treated as `[]`.
  - `suggestLocations` dedupes labels and caps them at 6.
- [ ] **Step 7: Add the env block** to `.env.example`, verbatim from the spec's Environment section, plus a comment line `# SUGGEST_PROVIDER="fake"  # end-to-end tests only`. In the README setup section, add one short paragraph naming the three keys, where to get them (logo.dev, geoapify.com), and that the app works without them.
- [ ] **Step 8: Run the tests.** Run: `npm test && npm run test:integration`. Expected: all pass.
- [ ] **Step 9: Commit.** `git commit -m "feat: company and city suggestion providers and services"`

---

### Task 5: Suggestion routes

**Files:**
- Create: `src/server/suggest/handler.ts`, `src/app/api/suggest/company/route.ts`, `src/app/api/suggest/location/route.ts`
- Modify: `src/server/services/rate-limit.ts` (constant)
- Test: `tests/integration/suggest-routes.test.ts`

**Interfaces:**
- Consumes: `suggestCompanies`, `suggestLocations`, `companyDirectory()`, `placeDirectory()` (Task 4); `rateLimit` (existing).
- Produces:
  - `SUGGESTIONS_PER_MINUTE = 120`
  - `handleSuggest<T>(request: Request, getUserId: () => Promise<string | null>, run: (userId: string, query: string) => Promise<T[]>, now?: Date): Promise<Response>`
  - HTTP contract for Task 6/7:
    - `GET /api/suggest/company?q=` gives `200 { suggestions: CompanySuggestion[] }`.
    - `GET /api/suggest/location?q=` gives `200 { suggestions: LocationSuggestion[] }`.
    - Errors: `401 { error: "unauthorized" }`, `429 { error: "rate_limited" }` with `Retry-After` in whole seconds.

- [ ] **Step 1: Write the failing integration tests** (clear `db.rateLimit` in `beforeEach`; `run` is a `vi.fn` returning `["x"]`):
  - `getUserId → null` gives 401, and `run` isn't called.
  - `q` of `" a "`, a missing `q`, and `"a".repeat(101)` each give `200 { suggestions: [] }`, and `run` isn't called.
  - `q=" acme "` calls `run(userId, "acme")` and returns `200 { suggestions: ["x"] }` with `Cache-Control: private, no-store`.
  - 120 calls at a fixed `now` give 200. The 121st gives 429 with a `Retry-After` between `1` and `60`. Another user is still 200.
- [ ] **Step 2: Run the tests.** Run: `npx vitest run --project integration tests/integration/suggest-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `handleSuggest`.** Order: user, then query length, then `rateLimit(\`suggest:${userId}\`, SUGGESTIONS_PER_MINUTE, 60_000, now)`, then `run`. All responses use `Response.json` with the no-store header. Routes are a thin `GET`:

```ts
export function GET(request: Request) {
  return handleSuggest(request, async () => (await auth())?.user?.id ?? null, (userId, q) => suggestCompanies(userId, q, companyDirectory()));
}
```

(The location route ignores `userId` and calls `suggestLocations(q, placeDirectory())`.)

- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Smoke-test against real providers.**
  - Run `npm run dev`, sign in, and open `/api/suggest/company?q=stri` and `/api/suggest/location?q=toron` in the browser.
  - Expected: Stripe with `stripe.com`, and `Toronto, ON, Canada`.
  - Signed out, `/api/suggest/company?q=stri` gives 401. Confirm the proxy doesn't redirect `/api/*` to `/login`. If it does, exclude `api/suggest` in the `src/proxy.ts` matcher or `auth.config.ts` `authorized` callback, so the route answers 401 itself.
  - `npx next build` succeeds (no `'use cache'` / dynamic-route errors).
- [ ] **Step 6: Commit.** `git commit -m "feat: authenticated, rate-limited suggestion API routes"`

---

### Task 6: `Combobox` and the company field

**Files:**
- Create: `src/components/ui/combobox.tsx`, `src/components/applications/company-field.tsx`, `tests/e2e/autocomplete.spec.ts`
- Modify: `src/components/applications/application-form.tsx`, `playwright.config.ts` (`webServer.env.SUGGEST_PROVIDER: "fake"`)

**Interfaces:**
- Consumes: the HTTP contract (Task 5), `CompanyLogo` (Task 3), and `companyDomain` in the form schema (Task 2).
- Produces:

```ts
type ComboboxOption = { id: string; value: string; render?: ReactNode; group?: string };
type ComboboxProps = Omit<ComponentProps<"input">, "onChange" | "value" | "defaultValue"> & {
  value: string;
  onValueChange: (value: string) => void;
  fetchOptions: (query: string, signal: AbortSignal) => Promise<ComboboxOption[]>;
  onPick: (option: ComboboxOption) => void;
  staticOptions?: (value: string) => ComboboxOption[]; // shown instead of fetching when it returns a non-empty list
  queryFor?: (value: string) => string;                // what to search for; defaults to value
  keepOpenAfterPick?: (option: ComboboxOption) => boolean;
  footer?: ReactNode;
  invalid?: boolean;
};
```

- [ ] **Step 1: Write the failing e2e test** in `tests/e2e/autocomplete.spec.ts`. Register as in `core-flow.spec.ts`, then:

```ts
await page.goto("/applications/new");
const company = page.getByRole("combobox", { name: "Company" });
await company.fill("stri");
await expect(page.getByRole("option", { name: /Stripe/ })).toBeVisible();
await company.press("ArrowDown");
await company.press("Enter");                                  // picks; must not submit
await expect(page).toHaveURL(/\/applications\/new$/);
await expect(company).toHaveValue("Stripe");
await expect(page.getByLabel("Company website")).toHaveValue("stripe.com");
await page.getByLabel("Job title").fill("Engineer");
await page.getByRole("button", { name: "Save application" }).click();
await page.goto("/board");
await expect(page.getByTestId("column-SAVED").getByTestId("company-logo").first()).toHaveAttribute("data-domain", "stripe.com");
```

Add a second test: type `Tiny Startup` without picking and save. The board card's `company-logo` has `data-domain=""` and shows the text `TS`. Add a third: pick Stripe, retype the company as `Strip`, and the website clears. Type `acme.io` into the website by hand, change the company, and the website stays `acme.io`.

- [ ] **Step 2: Run the test.** Run: `npx playwright test tests/e2e/autocomplete.spec.ts --project desktop`. Expected: FAIL (no combobox role).
- [ ] **Step 3: Implement `Combobox`.**
  - WAI-ARIA 1.2 combobox with a listbox popup: `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`; options are `role="option"` with `aria-selected`.
  - Debounce 250 ms. Fetch only when `queryFor(value).trim().length >= 2`. Abort the previous request on each new one.
  - A "Searching…" row while pending. An error closes the list.
  - Keys: ArrowUp/ArrowDown wrap. Enter with an active option calls `preventDefault()` and then picks. Escape closes. Tab closes. Blur closes, but use `onMouseDown` + `preventDefault` on options so a click picks before blur.
  - Group headings come from `group`. The list is absolutely positioned at full input width with `max-h-72 overflow-auto`, and options are `min-h-11`. Use `controlClasses` from `field.tsx` for the input.
- [ ] **Step 4: Implement `CompanyField`.**
  - Owns `company`, `website` and `websiteAuto` state, initialized from `initial`.
  - It renders the Company `Field` + `Combobox` (`name="company"`, `autoComplete="off"`), with options from `/api/suggest/company` rendered as `CompanyLogo sm` + name + muted domain, and `group: "Recent"` for `source === "recent"`.
  - It also renders the Company website `Field` (`id/name="companyDomain"`, `optional`, hint copy, `inputMode="url"`, placeholder `acme.com`), with `CompanyLogo sm` beside it when it isn't blank.
  - Picking sets both and `websiteAuto = true`. Typing in Company clears the website only while `websiteAuto`. Typing in the website sets `websiteAuto = false`.
  - In `ApplicationForm`, replace the Company field with `<CompanyField initial={initial} errors={fieldErrors} />`, keeping the Job title next to it. The website field spans `sm:col-span-2`.
- [ ] **Step 5: Run the tests.** Run: `npx playwright test tests/e2e/autocomplete.spec.ts && npx playwright test`. Expected: all pass on desktop and mobile, including the existing suites (`getByLabel("Company")` must still resolve to the combobox).
- [ ] **Step 6: Commit.** `git commit -m "feat: company autocomplete with logos and website field"`

---

### Task 7: Location field

**Files:**
- Create: `src/components/applications/location-field.tsx`
- Modify: `src/lib/location.ts`, `src/components/applications/application-form.tsx`, `tests/e2e/autocomplete.spec.ts`
- Test: `tests/unit/location.test.ts`

**Interfaces:**
- Consumes: `Combobox` (Task 6), `GET /api/suggest/location` (Task 5).
- Produces: `HYBRID_PREFIX = "Hybrid · "`, `cityQuery(value: string): string`, `applyCityPick(current: string, label: string): string`.

- [ ] **Step 1: Write the failing unit tests.**

```ts
test.each([["tor", "tor"], ["Hybrid · tor", "tor"], ["Hybrid · ", ""], ["Hybrid · t", "t"], ["Hybrid ·", "Hybrid ·"], ["  Remote ", "Remote"]])(
  "cityQuery(%j) = %j", (v, q) => expect(cityQuery(v)).toBe(q),
);
test("applyCityPick keeps the hybrid prefix", () => {
  expect(applyCityPick("Hybrid · tor", "Toronto, ON, Canada")).toBe("Hybrid · Toronto, ON, Canada");
  expect(applyCityPick("tor", "Toronto, ON, Canada")).toBe("Toronto, ON, Canada");
});
```

- [ ] **Step 2: Run the tests.** Run: `npx vitest run --project unit tests/unit/location.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `cityQuery` / `applyCityPick`** in `src/lib/location.ts`.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Write the failing e2e tests** in `autocomplete.spec.ts`:
  - Focus the empty Location field. The options `Remote` and `Hybrid…` show. Pick `Remote`, and the value is `Remote`.
  - Clear the field and pick `Hybrid…`. The value is `Hybrid · ` and the list stays open. Type `tor`, pick `Toronto, ON, Canada`, and the value is `Hybrid · Toronto, ON, Canada`.
  - Save. The detail page shows `Hybrid · Toronto, ON, Canada`.
  - The footer text `Powered by Geoapify` is visible while the list is open.
- [ ] **Step 6: Implement `LocationField`.**
  - Location `Field` + `Combobox` (`name="location"`, `autoComplete="off"`, placeholder kept).
  - `staticOptions`: when the value is blank, `[Remote, Hybrid…]`.
  - `queryFor = cityQuery`, and `keepOpenAfterPick` is true for `Hybrid…`.
  - Picking `Remote` gives `Remote`, `Hybrid…` gives `HYBRID_PREFIX`, and a city gives `applyCityPick(value, label)`.
  - Footer: the pinned copy, with links to `https://www.geoapify.com` and `https://www.openstreetmap.org/copyright`.
  - Swap it into `ApplicationForm`.
- [ ] **Step 7: Run the full suite.** Run: `npm run lint && npx tsc --noEmit && npm test && npm run test:integration && npx playwright test`. Expected: all pass.
- [ ] **Step 8: Commit.** `git commit -m "feat: location autocomplete with Remote and Hybrid quick picks"`
