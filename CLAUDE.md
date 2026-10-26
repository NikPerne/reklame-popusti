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
  index.ts            entry point: loads .env (local only), validates env, starts Fastify
  app.ts              buildApp(): registers plugins and routes; used by tests via app.inject()
  config/env.ts       zod schema for ALL env vars; the single source of truth for config
  routes/             one file per route group (health, auth, offers, admin)
  adapters/<store>/   one folder per store: adapter + pure parse functions      (Phase 2+)
  adapters/registry.ts list of enabled adapters                                  (Phase 2)
  scraping/           polite HTTP client: robots.txt, rate limit, UA, cache      (Phase 2)
  models/             Mongoose models (Offer)                                    (Phase 2)
  jobs/refresh.ts     CLI entry for the scheduled refresh                       (Phase 2)
server/test/          Vitest tests; fixtures in test/fixtures/<store>/
client/               Angular app (generated with Angular CLI)
```

## Commands (run from the repo root)

```bash
npm install                 # all workspaces
npm run dev:server          # tsx watch, http://localhost:3000
npm run dev:client          # ng serve, http://localhost:4200
npm test                    # all tests (Vitest on the server)
npm run lint                # ESLint (strict type-checked rules for the server)
npm run typecheck
npm run build
npm run format              # Prettier
npm test -w server -- adapters/lidl   # run a subset of tests
```

Node ≥ 24.15 is required (Angular 22). The version is pinned in `.node-version`, which Render also reads.

## Conventions

- TypeScript `strict`, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. No `any`; parse unknown input with zod.
- ESM throughout. Relative imports use the `.js` extension (`nodenext`). Use `import type` for type-only imports.
- Naming: files in `kebab-case.ts`, types and classes in `PascalCase`, functions and variables in `camelCase`, env vars in `UPPER_SNAKE_CASE`. Store ids are lowercase slugs: `mercator`, `lidl`, `hofer`, `spar`, `dm`, `mueller`.
- Config is read only through `loadEnv()` and passed down. Don't read `process.env` elsewhere.
- Errors: route handlers throw, and Fastify's error handler turns errors into JSON. Never leak stack traces or internal messages in production. Adapters throw on failure. The refresh runner catches errors **per store**, logs them, records the store's status and continues.
- Logging goes through the Fastify/pino logger (`app.log`, `request.log`). No `console.log` in server code.
- Prices are stored as numbers in EUR; dates as UTC `Date`. Prettier formats everything (single quotes, width 100).
- Commits are small and logical, with imperative subjects (for example `Add Lidl offer parser`).

## Store adapter pattern

```ts
interface StoreAdapter {
  readonly store: StoreId; // 'lidl', 'dm', ...
  fetchOffers(ctx: AdapterContext): Promise<Offer[]>; // ctx gives the polite HTTP client + logger
}
```

Normalized `Offer` fields: store, productName, brand, category, price, regularPrice, discountPercent, unitPrice (with unit), validFrom, validTo, imageUrl, sourceUrl, scrapedAt, plus a stable `externalId` for upserts.

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
- Client: a login page and a functional route guard on all other routes. An HTTP interceptor redirects to login on 401.

## Hosting and scheduled refresh

- Render free tier: a **Web Service** for `server`, with health check `/api/health`, and a **Static Site** for `client`. The static site rewrites `/api/*` to the web service, then `/*` to `/index.html`. The build and start commands are in README.md.
- Free web services sleep after about 15 minutes idle, so **no in-process schedulers** (no node-cron).
- The refresh is triggered by a **GitHub Actions scheduled workflow** that runs the refresh job against Atlas, using the repository secret `MONGODB_URI`. A manual trigger is `POST /api/admin/refresh`.
- Atlas M0: the network access list is `0.0.0.0/0`, because neither Render free nor GitHub runners have fixed IPs. The database user has `readWrite` on the `reklame` database only.

## Scraping etiquette (hard rules)

- Respect `robots.txt`. If a path is disallowed, don't fetch it. Tell the user instead of working around it.
- Send `SCRAPER_USER_AGENT`, which identifies the project. Don't spoof browser User-Agents.
- Allow at most one request in flight per host, with at least `SCRAPER_MIN_DELAY_MS` between requests. Cache responses for `SCRAPER_CACHE_TTL_MINUTES`.
- Fetch only what is needed for current offers. No crawling of full catalogues and no aggressive pagination. Refresh a few times a day at most.
- Fail gracefully: timeouts on every request, and no retry storms (at most one retry, with backoff). One broken store must never break the whole refresh.
