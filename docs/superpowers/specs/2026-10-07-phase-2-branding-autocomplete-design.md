# Phase 2: Landed branding, company and location autocomplete

Date: 2026-10-07
Status: Draft for review

## Goal

Make the job tracker feel like a finished, public product for a portfolio:

1. Rebrand the app as **Landed**, with its own logo mark and favicon.
2. Suggest companies while typing the company name, and show each company's logo on the board, table, detail page and form.
3. Suggest locations (cities worldwide plus Remote and Hybrid) while typing the location.

Audience: anyone can sign up (public portfolio app). Every outside call must therefore be authenticated, rate limited, keep secrets server side, and stay inside free tiers.

## Non-goals

- A public landing page at `/` (still redirects to `/board` or `/login`).
- Backfilling logos for applications saved before this phase. They show initials until edited.
- Street-level addresses, maps or coordinates.
- Storing logo images or logo URLs.

## Decisions

| Topic | Decision |
|---|---|
| Brand name | Landed |
| Branding scope | Rename everywhere, custom SVG logo mark, favicon and Apple touch icon |
| Company suggestions | The user's own past companies first, then Logo.dev Brand Search |
| Logos | Logo.dev image CDN keyed by the saved company domain |
| Missing logo | Colored initials avatar; optional "Company website" field to fix it |
| Location suggestions | Geoapify city autocomplete, worldwide, plus Remote and Hybrid quick picks |
| Architecture | All lookups go through the app's own API routes (no direct browser calls to providers) |

### Provider choices

- **Logo.dev** (companies and logos). Brand Search (`GET https://api.logo.dev/v2/search?q=&limit=`) takes a secret key and is meant to be called from a server. The free Community plan includes 500 search requests per minute and monthly API credits (about $0.00001 per search), plus 500K logo image requests per month. Logo images: `https://img.logo.dev/{domain}?token={publishable key}&size=..&format=webp&retina=true&fallback=404`. `fallback=404` returns 404 instead of a generated monogram, so the app can show its own initials. Free plan attribution is required for commercial use only. Landed adds a small "Logos provided by Logo.dev" credit anyway.
- **Brandfetch was considered and rejected.** Its Brand Search terms require calls to come straight from the visitor's browser, with no caching or storing of results, which conflicts with the server-side approach.
- **Geoapify** (locations). `GET https://api.geoapify.com/v1/geocode/autocomplete?text=&type=city&format=json&limit=6&apiKey=`. The free tier allows 3,000 requests per day and permits storing results. Attribution to Geoapify and OpenStreetMap is required and is shown in the location suggestion list.
- Mapbox (temporary geocoding results can't be stored) and the public Photon server (fair use only) were rejected for a public app.

## Data model

Add one optional column to `Application`:

```prisma
companyDomain String?   // e.g. "stripe.com"
```

- A new migration adds the nullable column. No backfill.
- The logo URL is derived at render time from `companyDomain`, never stored.
- `location` stays free text. Picked suggestions are saved as their label, for example `Toronto, ON, Canada`, `Remote`, `Hybrid · New York, NY, United States`.

### Validation

`applicationInputSchema` gains `companyDomain`: optional, blank becomes undefined, then normalized:

- lowercase, trim
- strip scheme (`https://`), credentials, port, path, query and hash
- strip a leading `www.`
- result must be a valid hostname: 1-253 characters, at least one dot, labels of `[a-z0-9-]` (1-63 characters, not starting or ending with `-`), with a TLD of at least 2 letters
- otherwise the error is "Enter a website like acme.com"

Examples: `https://www.Stripe.com/jobs` becomes `stripe.com`; `acme.io` stays `acme.io`; `localhost`, `not a site` and `javascript:alert(1)` are rejected.

## Server

### Provider interface

`src/server/suggest/` holds the provider code. The routes depend only on these interfaces, so tests use fakes and the provider can be swapped later.

```ts
type CompanySuggestion = { name: string; domain: string | null; source: "recent" | "directory" };
type LocationSuggestion = { label: string };

interface CompanyDirectory { search(query: string, signal: AbortSignal): Promise<{ name: string; domain: string }[]> }
interface PlaceDirectory { searchCities(query: string, signal: AbortSignal): Promise<LocationSuggestion[]> }
```

- `logoDevDirectory` implements `CompanyDirectory`; `geoapifyDirectory` implements `PlaceDirectory`.
- If the matching key is unset, a "disabled" directory that returns `[]` is used, so the app runs without keys.
- An env switch (`SUGGEST_PROVIDER=fake`) selects deterministic fake directories for end-to-end tests.

### Routes

`GET /api/suggest/company?q=...` and `GET /api/suggest/location?q=...` (route handlers under `src/app/api/suggest/`).

Shared behavior, in order:

1. Session required, otherwise `401`.
2. `q` is trimmed. Fewer than 2 or more than 100 characters returns `200 { suggestions: [] }` without calling providers.
3. Rate limit `suggest:{userId}`, 120 requests per minute, using the existing `rateLimit()`. Over the limit returns `429` with `Retry-After`.
4. Provider calls use a 3 second timeout (`AbortSignal.timeout`). Any provider error or timeout is logged and treated as no results. The route still returns `200`.
5. Responses send `Cache-Control: private, no-store`. The user's own companies must never be shared through a cache.

**Company route**

- Recent: up to 5 distinct companies from the current user's own applications whose name contains `q` (case-insensitive), most recently updated first, with the most recent non-null `companyDomain` for that name. The query is always filtered by the session's `userId`.
- Directory: Logo.dev search results for `q`, limit 8.
- Merge: recent first, then directory results whose domain isn't already listed (domain compared case-insensitively). If a recent entry has no domain and a directory entry has the same name (case-insensitive), the directory entry's domain fills it in and the duplicate is dropped. At most 8 results in total.
- Directory lookups for the same normalized query are cached server-side for 24 hours (the user's recent companies are not cached).

**Location route**

- Geoapify city autocomplete, limit 6, mapped to `City, Region, Country`. Uses `state_code` when present (for example `ON`, `NY`), otherwise `state`, and skips missing parts. The result list has no duplicate labels.
- Cached server-side per normalized query for 24 hours.

### Environment

Added to `.env.example`:

```
# Company search (server only) and logo images (publishable). Free plan at logo.dev.
LOGO_DEV_SECRET_KEY=""
NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY=""
# City suggestions (server only). Free plan at geoapify.com.
GEOAPIFY_API_KEY=""
```

The publishable logo key is designed to be visible in image URLs. The other two keys never reach the browser.

### Content Security Policy

No change needed. `img-src` already allows `https:` for logo images, and all lookups go to the app's own origin.

## Client

### `Combobox` (src/components/ui/combobox.tsx)

A reusable text input with a suggestion list that follows the WAI-ARIA combobox pattern (`role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `role="listbox"`/`option`).

- Fetches after 2 characters with a 250ms debounce. Each new request aborts the previous one, so old results never overwrite newer ones.
- Keyboard: ↑ and ↓ move, Enter picks the highlighted option (and doesn't submit the form while the list is open), Esc closes, Tab closes and keeps the typed text.
- A "Searching…" row shows while loading. Errors and `429` close the list silently, and the field stays a plain text input.
- The input keeps its own `name`, so the typed value is always what gets submitted. Suggestions are optional.
- Can show options before typing starts (used for location quick picks), and can show a footer (used for attribution).
- Mobile: the list matches the input width, options are at least 44px tall, and the list stays inside the screen.

### Company field

- Option row: `CompanyLogo` + name + domain. Recent results are under a "Recent" label.
- Picking an option sets the company name and the **Company website** field (`companyDomain`) and marks the website as auto-filled.
- **Company website** (`companyDomain`) is a visible optional input under Company, with the hint "Used to show the company logo."
- Editing the company name after picking clears the website only if it is still auto-filled. A website the user typed is never cleared.
- When the website field has a value, a small `CompanyLogo` preview appears next to it.

### Location field

- On focus with an empty field, it shows the quick picks **Remote** and **Hybrid…**.
- **Remote** sets `Remote` and closes the list.
- **Hybrid…** sets `Hybrid · ` and keeps the list open. A city picked while the value starts with `Hybrid · ` becomes `Hybrid · {city label}`.
- Typing (2+ characters, ignoring a leading `Hybrid · `) searches cities.
- Footer: "Powered by Geoapify · © OpenStreetMap contributors" with links.

### `CompanyLogo` (src/components/company-logo.tsx)

Props: `company: string`, `domain: string | null`, `size: "sm" | "md" | "lg"` (20, 24 and 40px).

- With a domain: an image from the Logo.dev CDN at 2x pixel size (retina), `format=webp`, `fallback=404`, `loading="lazy"`, fixed width and height, rounded, `alt=""` (the company name is always shown next to it). If the image fails to load, it switches to initials.
- Without a domain, or if the image fails: a circle with initials, meaning the first letters of the first two words (`Acme Corp` gives `AC`, `stripe` gives `S`, anything non-alphanumeric gives `?`). The background is picked from a fixed set of 8 color tokens by hashing the name. The tokens are defined for light and dark themes with readable contrast.
- With no publishable key set, it always shows initials.

### Where logos appear

- Board card (`CardBody`): `sm` logo before the company name. `BoardCard` and the board query gain `companyDomain`.
- Applications table: `sm` logo in the company cell.
- Application detail page header: `lg` logo.
- Form: preview next to Company website, plus a logo in company suggestion rows.
- Footer or user menu: "Logos provided by Logo.dev" link.

## Branding

- `Brand` component: a new inline SVG logo mark (a check mark landing on a horizon line) inside the existing `bg-primary` rounded square, replacing the Briefcase icon. The text reads "Landed".
- `src/app/icon.svg` (favicon) and `src/app/apple-icon.png` (180×180), using Next's file-based metadata conventions.
- Root metadata title: `{ default: "Landed", template: "%s | Landed" }`, plus a description.
- App header home link `aria-label="Landed home"`.
- README title and intro updated.

## Error handling summary

| Situation | Result |
|---|---|
| Provider down or slow | Recent companies only, or an empty list. The form works as normal. |
| Missing API keys | No directory or city results, initials only. No errors. |
| Rate limited | The list closes quietly. Typing still works. |
| Logo 404 or blocked | Initials avatar |
| Invalid website | Field error "Enter a website like acme.com" |

## Testing

**Unit (Vitest)**
- Domain normalization and rejection cases.
- Initials and color picking (same name gives the same color; edge cases include empty, emoji and non-Latin names).
- Location label formatting from Geoapify fields, and removing duplicates.
- Merging recent and directory company results (domain dedupe, name match filling in a missing domain, limit of 8).
- Parsing the `Hybrid · ` prefix.

**Integration (Vitest + test DB)**
- Both routes return `401` without a session.
- Short and long `q` return an empty list without calling the provider.
- The 121st request in a minute returns `429`.
- A provider that throws or times out still returns recent companies with `200`.
- **Isolation:** user B's company suggestions never include user A's companies.
- Create and update persist `companyDomain`, normalized.

**End-to-end (Playwright, `SUGGEST_PROVIDER=fake`)**
- Type a company, pick a suggestion with the keyboard, save, and see the logo `img` on the board card with the right domain.
- A company with no website shows initials on the board.
- Location: Remote quick pick; Hybrid… followed by a city gives `Hybrid · {city}`.
- Typing without picking still saves the typed text.

## Rollout

1. Create free Logo.dev and Geoapify accounts and add the three keys to `.env.local` and the hosting provider (for example Vercel).
2. Run the migration.
3. Without keys, the app still works without outside suggestions or logos.
