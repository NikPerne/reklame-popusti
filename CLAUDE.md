# CLAUDE.md

Context for AI-assisted work on this repo. **Keep this file and README.md up to date whenever the architecture, commands, env vars or conventions change.**

## Purpose

A personal PWA that aggregates current discounts from Slovenian retailers (Mercator, Lidl, Hofer, Spar, dm, Müller) and makes them searchable in one place. It has one user, the owner, and must not be publicly accessible.

## Architecture

- `server/`: a Fastify + TypeScript API. Store adapters fetch offers and normalize them to one `Offer` model. A refresh job runs all adapters and upserts the results into MongoDB Atlas. A REST API serves search and listings.
- `client/`: an Angular 22 PWA. The UI is in Slovenian by default, with English available through Transloco runtime switching. It talks to the API through relative `/api/*` URLs: in development via the Angular dev-server proxy, and in production via a Render static-site rewrite. This keeps everything same-origin.
- Database: MongoDB Atlas M0 with Mongoose. Search uses an Atlas Search index with `icuFolding`, which ignores diacritics (č/š/ž). `SEARCH_MODE=basic` instead uses a regex on a precomputed `searchText` field (lowercase, diacritics removed), for local development and tests. `mongodb-memory-server` has no Atlas Search.
- Expired offers are deleted by a TTL index on `expiresAt`, which is `validTo` plus a grace period.

## Repo structure

```
server/src/
  index.ts                 API entry: loads .env (local only), validates env, connects DB, starts Fastify
  app.ts                   buildApp(deps): plugins, error handler, routes. Tests call it with fakes
  config/env.ts            zod schema for ALL env vars (loadEnv for the API, loadRefreshEnv for the job)
  domain/                  stores, shared category ids, Offer schema + finalizeOffer/normalizeSearchText
  adapters/store-adapter.ts StoreAdapter + AdapterContext interfaces
  adapters/registry.ts     list of enabled adapters
  adapters/<store>/        one folder per store: adapter + pure parse functions (from Phase 3)
  scraping/                PoliteHttpClient: robots.txt, per-host queue + delay, UA, cache, timeout, 1 retry
  db/                      Mongoose models + indexes, connect, Atlas Search index definition (JSON)
  repositories/            OfferRepository interface + Mongo implementation (search pipeline builders)
  jobs/refresh-runner.ts   runRefresh (per-store isolation, validation) + RefreshTrigger (no overlap)
  jobs/refresh.ts          CLI entry for the scheduled refresh (exit code 1 if any store failed)
  plugins/auth.ts          default-deny auth hook, cookie + JWT setup
  routes/                  health, auth, offers (+ stores, categories), admin
  scripts/hash-password.ts prints an argon2 hash for APP_PASSWORD_HASH
server/test/               Vitest; helpers.ts has testEnv, FakeOfferRepository, buildTestApp, login
server/test/fixtures/      saved store responses for adapter tests
client/                    Angular app (generated with Angular CLI)
```

## Commands (run from the repo root)

```bash
npm install                 # all workspaces
npm run dev:server          # tsx watch, http://localhost:3000
npm run dev:client          # ng serve, http://localhost:4200
npm test                    # all tests (Vitest on the server)
npm run lint                # ESLint: strict type-checked rules for the server, angular-eslint (ng lint) for the client
npm run typecheck
npm run build
npm run format              # Prettier
npm test -w server -- adapters/lidl   # run a subset of tests
npm run refresh:dev -w server         # one refresh against the DB in .env (tsx)
npm run refresh -w server             # same, from the build (used by GitHub Actions)
npm run hash-password -w server
```

Tests never need a database or network: routes run through `app.inject()` with `FakeOfferRepository`, the HTTP client gets a fake `fetch` and a virtual clock, and the Mongo search pipelines are tested as pure builder functions.

Node ≥ 24.15 is required (Angular 22). The version is pinned in `.node-version`, which Render also reads.

## Conventions

- TypeScript `strict`, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. No `any`; parse unknown input with zod.
- ESM throughout. Relative imports use the `.js` extension (`nodenext`). Use `import type` for type-only imports.
- Naming: files in `kebab-case.ts`, types and classes in `PascalCase`, functions and variables in `camelCase`, env vars in `UPPER_SNAKE_CASE`. Store ids are lowercase slugs: `mercator`, `lidl`, `hofer`, `spar`, `dm`, `mueller`.
- Config is read only through `loadEnv()` and passed down. Don't read `process.env` elsewhere.
- Errors: route handlers throw, and Fastify's error handler turns errors into JSON. Never leak stack traces or internal messages in production. Adapters throw on failure. The refresh runner catches errors **per store**, logs them, records the store's status and continues.
- Logging goes through pino (`app.log`, `request.log`, or the `Logger` passed in). No `console.log` in server code, except interactive CLI output in `scripts/`.
- Dependencies are passed in, not imported as singletons (`buildApp(deps)`, `runRefresh(deps)`), so tests can use fakes.
- Optional properties with `exactOptionalPropertyTypes`: add them conditionally (`...(x !== undefined && { x })`) rather than assigning `undefined`.
- Prices are stored as numbers in EUR; dates as UTC `Date`. Prettier formats everything (single quotes, width 100).
- Commits are small and logical, with imperative subjects (for example `Add Lidl offer parser`).

## Store adapter pattern

```ts
interface StoreAdapter {
  readonly store: StoreId; // 'lidl', 'dm', ...
  fetchOffers(context: AdapterContext): Promise<ScrapedOffer[]>; // context: { http, log, now }
}
```

An adapter returns `ScrapedOffer`s: externalId (stable, unique per store), productName, brand?, category (a shared id from `domain/categories.ts`), sourceCategory? (the store's own label), price, regularPrice?, discountPercent?, unitPrice? `{ amount, unit: 'kg' | 'l' | 'piece' }` (at the offer price), condition? `{ kind: 'loyalty-card' | 'multi-buy' | 'coupon' | 'other', text }`, validFrom?, validTo?, imageUrl?, sourceUrl?.

- **Scope is discounts only** (owner's decision): adapters return products that are currently cheaper than usual, not full catalogues.
- `price` is always the deal price. The owner has every store's loyalty card (Pika, Lidl Plus, Spar Plus, dm, Müller), so card prices count as the real price and are marked with a `loyalty-card` condition. Multi-buy deals use the per-item price when the condition is met (`multi-buy`, e.g. "Ob nakupu 2 ali več").
- Normalize unit prices to €/kg, €/l or €/piece so "where is milk cheapest" works with `sort=unitPrice`.
- Store dates are Ljubljana local time: convert with `fromStoreLocalTime` (`lib/time.ts`). Drop end dates that are already in the past if the store still shows the offer.
- Shared text helpers (`toSentenceCase`, `toTitleCase`, `parseDecimal`, `roundMoney`) live in `lib/text.ts`.

Store-specific notes (see the README store table for data sources):

- **Mercator**: `adapters/mercator/`. Discount types: straight cut (normal_price > current_price), Pika card (marker 104), multi-buy ("Ob nakupu N izdelkov ali več je vsak P % ceneje"). Other markers (extra points, quality labels, combos) are not price cuts and are skipped. When several apply, the cheapest wins.
- **dm**: do not scrape; its only data source is disallowed by robots.txt.

The refresh runner then validates each offer with `scrapedOfferSchema`, skipping and logging invalid ones. `finalizeOffer` adds store, scrapedAt, searchText, expiresAt, and discountPercent when it can be computed. Each store's offers are replaced by upsert on `(store, externalId)`, and the offers not seen in this run are deleted. If an adapter throws or returns no valid offers, the store's previous offers are kept and its status is recorded as failed (`GET /api/stores` shows it).

Rules for adding a store:

1. **Investigate first.** Find out how the store exposes offers (JSON API, HTML or flyer), check robots.txt, and report the findings to the user **before** implementing. Prefer stable, structured, public sources. Avoid headless browsers unless there is no alternative.
2. Keep fetching and parsing separate. Parse functions are pure (raw response in, `Offer[]` out) and tested against saved fixtures in `server/test/fixtures/<store>/`. Tests never hit live sites.
3. All HTTP goes through the shared polite client. Never call `fetch` directly from an adapter.
4. Register the adapter in `adapters/registry.ts`. Adding a store must not require changes to core code.
5. Update the store table in README.md.

## Authentication

- Single user. The password is checked with argon2 against `APP_PASSWORD_HASH`. Generate the hash with `npm run hash-password -w server`.
- `POST /api/auth/login` is rate-limited per IP (`LOGIN_RATE_LIMIT_*`). On success it sets a JWT (signed with `JWT_SECRET`, lifetime `SESSION_TTL_HOURS`) in an **httpOnly, Secure, SameSite=Strict** cookie. `POST /api/auth/logout` clears it. `GET /api/auth/me` checks the session.
- **Public endpoints:** `GET /api/health` and `POST /api/auth/login` only. Everything else needs the session cookie, except `POST /api/admin/refresh`, which needs the header `X-Refresh-Token: <REFRESH_TOKEN>`.
- Default deny: the `onRequest` hook in `plugins/auth.ts` requires a session for every route, including unknown ones. A route opts out only through `config: { auth: 'public' }` or `config: { auth: 'refresh-token' }`. Never add a public route without the user's agreement.
- `TRUST_PROXY_HOPS` decides which `X-Forwarded-For` entry counts as the client IP for the rate limit. Keep it at the actual number of Render proxies (verify after deploying).
- Client: a login page and a functional route guard on all other routes. An HTTP interceptor redirects to login on 401.

## Hosting and scheduled refresh

- Render free tier: a **Web Service** for `server`, with health check `/api/health`, and a **Static Site** for `client`. The static site rewrites `/api/*` to the web service, then `/*` to `/index.html`. The build and start commands are in README.md.
- Free web services sleep after about 15 minutes idle, so **no in-process schedulers** (no node-cron).
- The refresh is triggered by `.github/workflows/refresh.yml` (cron 3x daily + manual "Run workflow"), which builds the server and runs `npm run refresh -w server` with the repository secret `MONGODB_URI`. Another manual trigger is `POST /api/admin/refresh`.
- `.github/workflows/ci.yml` runs format check, lint, typecheck, tests and build on every push to main.
- The developer machine is on a network that blocks outbound port 27017, so it cannot reach Atlas. Verify database behaviour via the GitHub Actions refresh or on Render, not locally.
- Atlas M0: the network access list is `0.0.0.0/0`, because neither Render free nor GitHub runners have fixed IPs. The database user has `readWrite` on the `reklame` database only.

## Scraping etiquette (hard rules)

- Respect `robots.txt`. If a path is disallowed, don't fetch it. Tell the user instead of working around it.
- Send `SCRAPER_USER_AGENT`, which identifies the project. Don't spoof browser User-Agents.
- Allow at most one request in flight per host, with at least `SCRAPER_MIN_DELAY_MS` between requests. Cache responses for `SCRAPER_CACHE_TTL_MINUTES`.
- Fetch only what is needed for current offers. No crawling of full catalogues and no aggressive pagination. Refresh a few times a day at most.
- Fail gracefully: timeouts on every request, and no retry storms (at most one retry, with backoff). One broken store must never break the whole refresh.
