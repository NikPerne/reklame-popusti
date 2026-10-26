# CLAUDE.md

Context for AI-assisted work on this repo. **Keep this file and README.md up to date whenever the architecture, commands, env vars or conventions change.**

## Purpose

A personal PWA that aggregates current discounts from Slovenian retailers (Mercator, Lidl, Hofer, Spar, dm, Müller) and makes them searchable in one place. It is private: accounts are created only with an invite code from the owner.

## Architecture

- `server/`: a Fastify + TypeScript API. Store adapters fetch offers and normalize them to one `Offer` model. A refresh job runs all adapters and upserts the results into MongoDB Atlas. A REST API serves search and listings.
- `client/`: an Angular 22 PWA. The UI is in Slovenian by default, with English available through Transloco runtime switching. It talks to the API through relative `/api/*` URLs: in development via the Angular dev-server proxy; in production the same Fastify server serves both the app and the API. This keeps everything same-origin.
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
  routes/                  health, auth (signup, login), offers (+ stores, categories), shopping-list, settings, admin
  domain/account.ts        email/password/signup schemas, SHARED_LISTS parsing, listMembership()
server/test/               Vitest; helpers.ts has testEnv, fake repositories, buildTestApp, login(app, email?), signup(app, email)
server/test/fixtures/      saved store responses for adapter tests
client/src/app/
  app.ts|html|scss         shell: header with SL/EN switch and logout, <router-outlet>
  app.config.ts            providers: router, HttpClient + authInterceptor, Transloco, language restore
  app.routes.ts            /login (guestGuard; also signup) and the app pages (authGuard), all lazy-loaded
  core/api/                API types (mirror of the server's model; keep in sync) + OffersApi
  core/auth/               AuthService (status + email signals), guards, authInterceptor, SessionData (ties local data to one account)
  core/i18n/               LanguageService (sl default, remembered in localStorage), Transloco loader
  features/login/          LoginPage: login, or signup with an invite code
  core/shopping-list/      ShoppingListService: local-first list (localStorage + pending-change queue), syncs to the API
  core/settings/           SettingsService: preferred stores, hidden categories (same sync pattern)
  features/search/         SearchPage (state in URL query params), SearchFilters, OfferCard (+ button, "Tudi:"), HomeSections, search-params.ts
  features/shopping-list/  ShoppingListPage (/seznam): grouped by store, tap to cross off
  features/settings/       SettingsPage (/nastavitve)
  features/scanner/        ScannerPage (/skeniraj): BarcodeDetector or lazily loaded ZXing; EAN check digit
  shared/format.ts         eur and shortDate pipes (Intl, take the language as an argument)
client/public/i18n/        sl.json and en.json; every UI string goes through Transloco
client/src/testing/        test helpers: translocoTesting() with the real translations, offer factories
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
```

Tests never need the network: routes run through `app.inject()` with fake repositories, the HTTP client gets a fake `fetch` and a virtual clock. `server/test/integration/` runs the real Mongo queries against an in-memory MongoDB (`mongodb-memory-server`, downloaded on first run, cached in CI); add a case there for every query change, because pipeline-shape unit tests can't catch wrong operators. Atlas Search (`$search`) can't run there; the `basic` mode is used.

When generating code containing MongoDB variables (`$ROOT`, `$this`) with a script, beware that `String.replace` treats `$` in the replacement specially (`$$` becomes `$`, and `` $` `` inserts all text before the match). Use the Edit tool for such text. This broke production search once and duplicated half of this file once.

Node ≥ 24.15 is required (Angular 22). The version is pinned in `.node-version`, which Render also reads.

The root `package.json` has `"overrides": { "vite": "8.3.5" }` because `@angular/build` 22.2.4 pins Vite 8.3.0, which has dev-server advisories. Remove the override once an Angular release ships a fixed Vite.

## Conventions

- TypeScript `strict`, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. No `any`; parse unknown input with zod.
- ESM throughout. Relative imports use the `.js` extension (`nodenext`). Use `import type` for type-only imports.
- Naming: files in `kebab-case.ts`, types and classes in `PascalCase`, functions and variables in `camelCase`, env vars in `UPPER_SNAKE_CASE`. Store ids are lowercase slugs: `mercator`, `lidl`, `hofer`, `spar`, `dm`, `mueller`.
- Config is read only through `loadEnv()` and passed down. Don't read `process.env` elsewhere.
- Errors: route handlers throw, and Fastify's error handler turns errors into JSON. Never leak stack traces or internal messages in production. Adapters throw on failure. The refresh runner catches errors **per store**, logs them, records the store's status and continues.
- Logging goes through pino (`app.log`, `request.log`, or the `Logger` passed in). No `console.log` in server code, except interactive CLI output in `scripts/`.
- Dependencies are passed in, not imported as singletons (`buildApp(deps)`, `runRefresh(deps)`), so tests can use fakes.
- Optional properties with `exactOptionalPropertyTypes`: add them conditionally (`...(x !== undefined && { x })`) rather than assigning `undefined`.
- Prices are stored as numbers in EUR; dates as UTC `Date`. Prettier formats everything (single quotes, width 100). Always run it from the repo root (`npm run format`): `.prettierignore` lives there, and running it inside `server/` would reformat the HTML fixtures and break their parsing.
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
- **Lidl**: `adapters/lidl/`. Homepage → every `/c/<slug>/a<id>` page → `data-grid-data` JSON (decoded with `lib/html.ts`). Price from `regionsPrices['1']`: `currentLidlPlusPrice` (→ condition "Lidl Plus") wins over `currentPrice`. Id is `erpNumber` (unique per variant; variants share `productId`). Dates are `storeStartDate`/`storeEndDate` (Unix seconds); offers whose in-store period ended are skipped. Lidl's categories (Food, F+V, P+F, NonFood) are refined with `guessCategory` (`domain/categorize.ts`, keyword rules matched on the name's head first; one `words('a|b|c')` line per category). One failing offer page is logged and skipped.
- **Hofer**: `adapters/hofer/`. "Pregled posebne ponudbe" listing (`?page=N`, 60 per page; robots.txt allows `?page=`). Products from the Nuxt payload (`lib/nuxt-data.ts` decodes `__NUXT_DATA__`) at `pinia.search.searchResult`. Prices are in cents (`amountRelevant`); no regular price; `onSaleDate` is the start date (no end date). Image URL templates (`{width}`, `{slug}`) are filled in. Hofer category names map via a table, else `guessCategory`.
- **Spar**: `adapters/spar/`. online.spar.si categories S17-1 ("Iz letaka") and S17-2 ("Akcije, dom in prosti čas"), `?currentPage=N`, 50 per page. Products are `CatalogProductModel` objects in the Next.js flight payload (`lib/next-flight.ts`). Offer price = `promotion.conditions[quantity 0].price`, regular = `price`, unit price = `promotionPricePerSubUnit` per `subUnit`. Product URL `/p/<slug>`. robots.txt etiquette: `minDelayMs: 10_000` per request and `isAllowedAt` (04:00–08:45 UTC); outside the window the runner skips Spar (`skipped: true`), keeping its offers.
- **Eurospin**: `adapters/eurospin/`, parsed with cheerio. `/akcije/` lists all offers; the 26 `?category_filter=` pages are read to map article numbers (image file names, e.g. `smt/11371001.jpg`) to Eurospin categories; one failing category page only loses those categories. Dates "22.10 - 28.10" have no year (`parseEurospinDates` picks the year closest to now; offers end at 23:59:59 local). Preview cards without a price are skipped.
- **Tuš**: `adapters/tus/`, parsed with cheerio. WooCommerce lists (`TUS_LISTS`: "aktualno-iz-kataloga", "tus-klub-50"), `/page/N/`, page count from page 1's pagination. Id = `data-gtm4wp_product_id` (WordPress post id). Category: `product_cat-<slug>` (sub) first, then `product_cat_m-<slug>` (main), then `guessCategory`. Brand from `pa_znamka-<slug>`. Unit price via `unitPriceFromName` (`lib/unit-price.ts`). A product in both lists keeps the cheaper offer.
- Adapters can declare `isAllowedAt(now)` (visiting hours) and pass `minDelayMs` on requests (longer per-site delay). Never remove these to make a manual run work.
- **Owner's scope decisions**: no "permanently lowered price" lists (Hofer "Vse spuščene cene", Tuš "Trajno znižano"), no Tuš "Mojih 10". Tuš: only "Aktualno iz kataloga" and "Tuš Klub −50 %" (condition "Tuš klub"). All planned stores are done; dm and Müller are deliberately not scraped.
- **Grouping**: after each refresh `regroup()` links offers sharing any barcode (union-find in `domain/grouping.ts`) and same-store duplicates (same name and price) via `groupKey`; search collapses each group to its best offer for the sort, the rest in `alsoAt`. Barcodes come from Mercator (`gtins`), Spar (`ean`) and Tuš (`data-product-ean`).
- Shared parsing helpers: `lib/unit-price.ts` (`parseUnitPriceText`: "1 kg = 0,90", "100 g = …", "1,90 €/1 kg"), `lib/html.ts` (`attributeValues`, `decodeHtmlEntities`), `domain/categorize.ts` (`guessCategory`).
- **dm**: do not scrape; its only data source is disallowed by robots.txt.

The refresh runner then validates each offer with `scrapedOfferSchema`, skipping and logging invalid ones. `finalizeOffer` adds store, scrapedAt, searchText, expiresAt, and discountPercent when it can be computed. Each store's offers are replaced by upsert on `(store, externalId)`, and the offers not seen in this run are deleted. If an adapter throws or returns no valid offers, the store's previous offers are kept and its status is recorded as failed (`GET /api/stores` shows it).

Rules for adding a store:

1. **Investigate first.** Find out how the store exposes offers (JSON API, HTML or flyer), check robots.txt, and report the findings to the user **before** implementing. Prefer stable, structured, public sources. Avoid headless browsers unless there is no alternative.
2. Keep fetching and parsing separate. Parse functions are pure (raw response in, `Offer[]` out) and tested against saved fixtures in `server/test/fixtures/<store>/`. Tests never hit live sites.
3. All HTTP goes through the shared polite client. Never call `fetch` directly from an adapter.
4. Register the adapter in `adapters/registry.ts`. Adding a store must not require changes to core code.
5. Update the store table in README.md.

## Frontend conventions

- Standalone components, signals, `input()`/`output()`, built-in control flow (`@if`, `@for`). The app is zoneless.
- File names without type suffixes (`search-page.ts`, class `SearchPage`); one folder per feature under `features/`.
- All text comes from `public/i18n/{sl,en}.json` via `*transloco`. Add every new key to both files. Store data (product names, condition texts) stays in the store's language.
- Search state lives in the URL query (`q`, `store`, `category`, `minDiscount`, `sort`); `search-params.ts` converts between URL, state and API parameters.
- Styles: global tokens (colours, spacing, store colours) in `src/styles.scss` with a dark-mode variant; component styles use only those variables. Mobile first: check layouts at 390 px. Grid columns use `minmax(0, 1fr)` so long text can't widen the page.
- Tests use Vitest with TestBed, `provideHttpClientTesting()` and `translocoTesting()`; no real backend.
- User data (shopping list, settings) is local-first: change the signal and localStorage at once, queue the change, sync when online; the server keeps the copy with the newest `updatedAt`.
- Search URL: no `store` param = preferred stores; `store=` (empty) = explicitly all stores.

## Authentication

- Accounts (`users` collection: email, argon2 `passwordHash`). `POST /api/auth/signup` needs the invite code `SIGNUP_CODE` (compared in constant time; unset = signup closed). Emails are lower-cased. Login answers the same for an unknown email and a wrong password (and verifies against a dummy hash, so timing is the same).
- Signup and login are rate-limited per IP (`LOGIN_RATE_LIMIT_*`). On success they set a JWT `{ sub: userId, email }` (signed with `JWT_SECRET`, lifetime `SESSION_TTL_HOURS`) in an **httpOnly, Secure, SameSite=Strict** cookie. The auth hook rejects tokens without an email (pre-accounts sessions). `POST /api/auth/logout` clears the cookie. `GET /api/auth/me` returns `{ email }`.
- Settings are per user (`user_settings`, `_id` = user id). Shopping lists are per list (`shopping_items`, `_id` = `listId/itemId`): `listMembership()` gives `shared:<first email>` to accounts grouped in `SHARED_LISTS` (env var, so emails stay out of this public repo) and `user:<id>` to everyone else. Items merge per item (newer `updatedAt` wins), so two people can edit a shared list at once.
- Client: `SessionData` remembers which account the local list/settings belong to. Logout or a different account clears them; the first login after the switch to accounts uploads the local list (`adoptLocal`). The list re-syncs when the app becomes visible and every 30 s on the list page.
- **Public endpoints:** `GET /api/health`, `POST /api/auth/signup` and `POST /api/auth/login` only. Everything else needs the session cookie, except `POST /api/admin/refresh`, which needs the header `X-Refresh-Token: <REFRESH_TOKEN>`.
- Default deny: the `onRequest` hook in `plugins/auth.ts` requires a session for every route under `/api`, including unknown ones (the web app's own files are public). A route opts out only through `config: { auth: 'public' }` or `config: { auth: 'refresh-token' }`. Never add a public route without the user's agreement.
- `TRUST_PROXY_HOPS` decides which `X-Forwarded-For` entry counts as the client IP for the rate limit. Keep it at the actual number of Render proxies (verify after deploying).
- Client: `authGuard` asks `GET /api/auth/me` once; only a 401 counts as logged out (offline still opens the app, for cached results). `authInterceptor` sends the user to `/login` on a 401 from data requests, but leaves `/api/auth/*` to the guards and login page. The login page follows `returnUrl` only for in-app paths.

## Hosting and scheduled refresh

- Render free tier, **one Web Service** for everything (owner's requirement, to stay within free limits): build `npm ci --include=dev && npm run build`, start `npm run start -w server`, health check `/api/health`. `--include=dev` because Render builds with `NODE_ENV=production`. Setup steps are in README.md.
- Fastify serves the built Angular app (`plugins/client-app.ts`, root `CLIENT_DIST_DIR` or `client/dist/client/browser`): app routes without a file extension get `index.html`, hashed bundles are cached for a year, `index.html`/`ngsw*` are `no-cache`. App files are public; the auth hook only guards `/api`. Security headers come from `@fastify/helmet` in `app.ts`: strict CSP with `script-src 'self'` (no inline scripts, so critical-CSS inlining is off in `angular.json`). The service worker runs under the CSP of its own script and fetches product images with `fetch()` (connect-src), so `ngsw-worker.js` is served with `connect-src 'self' https:`. Browsers keep an installed worker (and its CSP) until the script bytes change, so header-only changes to the worker need a one-time "clear site data" on existing installs. Test service-worker behaviour by letting it install (~30 s after the app is stable) and loading the page a second time.
- PWA: `@angular/service-worker` (`client/ngsw-config.json`). API data groups `offers` and `filters` use the freshness strategy (network first, cache after 8 s or offline). `/api/auth/*` is never cached. Icons are generated by `node client/scripts/generate-icons.mjs`.
- The free web service sleeps after about 15 minutes idle, so **no in-process schedulers** (no node-cron).
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
