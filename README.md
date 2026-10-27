# reklame-popusti

🛒 One search, every discount. A personal, installable PWA that collects current discounts and special offers from Slovenian retailers and lets you search them all in one place.

Search for a product such as `kava` or `pralni prašek` and see every current offer across stores: price, regular price, discount %, unit price, validity dates, store, image and a link to the source.

> **Status:** Live at https://popusti.onrender.com with offers from Mercator, Lidl, Hofer, Spar, Eurospin and Tuš (API, frontend, PWA, scheduled refresh). Next: investigating personal Lidl Plus coupons (optional). See the [Roadmap](#roadmap).

## Features

- **Search** across all stores, diacritic-insensitive, with filters (store, category, minimum discount) and sorting (price, **price per unit**, discount, ending soon, newest).
- **Everyday prices (Mercator, Spar)**: the full online catalogues are read too, so a search compares the discounts with what a product normally costs elsewhere. These products are marked _Redna cena_; browsing (home page, categories) and the _Samo akcije_ filter show discounts only. Tuš has no online shop with its full range, so only its discounts are known.
- **Same product across stores**: offers sharing a barcode (Mercator, Spar, Tuš) are shown as one result, cheapest first, with "Tudi: Spar 1,99 € · Tuš 2,09 €".
- **Shopping list**: a **+** on every offer; the list is grouped by store with subtotals, items are crossed off in the shop, and it syncs between devices (works offline).
- **Start page**: "Novo ta teden" and "Kmalu poteče" rows; next week's offers on request.
- **Settings**: preferred stores (the default filter) and hidden categories, synced between devices.
- **Barcode scanner**: scan a product in the shop to see its offers in all stores.
- **Store health**: a warning when a store has had no fresh data for over a day.
- Loyalty-card prices (Pika, Lidl Plus, Tuš klub) and multi-buy deals are marked; Slovenian UI with English; installable PWA.

## Supported stores

| Store    | Adapter     | Data source                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mercator | ✔ done      | JSON endpoint behind the online shop's product grid (`mercatoronline.si/products/browseProducts/getProducts`), the whole catalogue, fetched per top-level category (one listing returns at most 10,000). About 16,800 products, about 3,500 of them discounted; about 215 requests per run (8 min). Online-shop prices, which usually match the stores.                                                                                                         |
| Lidl     | ✔ done      | Weekly offer pages (`/c/<topic>/a<id>`, about 23, linked from the homepage) embed full product JSON (`data-grid-data`), including the Lidl Plus price. About 500 offers, ~24 requests per run. Includes weekly offers without an old price (shown without a discount %). Their JSON API needs authentication and is not used.                                                                                                                                   |
| Hofer    | ✔ done      | "Pregled posebne ponudbe" listing (all current special offers, ~280, 60 per page) with the products in the page's embedded Nuxt payload (`__NUXT_DATA__`). Offer price and on-sale date only; Hofer publishes no regular price, so no discount %. The "Vse spuščene cene" (permanently lowered prices) list is not included.                                                                                                                                    |
| Spar     | ✔ done      | Online shop `online.spar.si`: the offer categories "Iz letaka" and "Akcije, dom in prosti čas", then the 18 other top-level categories, about 20,500 products (50 per page, `?currentPage=N`). Products come from the Next.js flight payload in the HTML. Respects spar.si's robots.txt wishes: 10 s between requests and visits only 04:00–08:45 UTC. About 430 pages, so about 75 minutes; it stops (and keeps the previous data) if it would run past 08:45. |
| dm       | not planned | Offers only come from `product-search.services.dmtech.com`, whose robots.txt disallows everything.                                                                                                                                                                                                                                                                                                                                                              |
| Eurospin | ✔ done      | `eurospin.si/akcije/`: one page with all ~390 offers as schema.org product cards (old/new price, size, unit price, validity), plus its 26 `?category_filter=` pages to learn each product's category (27 requests per run). Next week's preview cards without a price are skipped.                                                                                                                                                                              |
| Tuš      | ✔ done      | WooCommerce offer lists "Aktualno iz kataloga" (~15 pages) and "Tuš Klub −50 %" (~3 pages, condition "Tuš klub"), 36 products per page, about 590 offers and 18 requests per run. Regular price and discount % from the cards; unit price calculated from the size in the name. The lists have no validity dates. "Trajno znižano" and "Mojih 10" are not included.                                                                                             |
| Müller   | postponed   | No product offers online, only campaign texts and PDF leaflets.                                                                                                                                                                                                                                                                                                                                                                                                 |

Each store's data source (public JSON endpoint, HTML page or online flyer) is investigated and documented here before its adapter is written.

## Tech stack

- **Backend:** Node.js 24, TypeScript (strict), [Fastify](https://fastify.dev), Mongoose, zod
- **Frontend:** Angular 22, installable PWA (service worker + manifest), Transloco (Slovenian UI with an English switch)
- **Database:** MongoDB Atlas (M0 free tier) with Atlas Search for diacritic-insensitive search
- **Hosting:** Render free tier, one web service that serves both the API and the web app
- **Scheduling:** GitHub Actions scheduled workflow
- **Tooling:** npm workspaces, Vitest, ESLint, Prettier

## Repository layout

```
reklame-popusti/
├── server/            Fastify API, store adapters, refresh job
│   ├── src/
│   └── test/          Vitest tests; adapter fixtures in test/fixtures/<store>/
├── client/            Angular PWA
├── .env.example       All environment variables (copy to .env)
├── CLAUDE.md          Context for AI-assisted development
└── package.json       npm workspaces root
```

## Running locally

Requirements: **Node.js ≥ 24.15** (see `.node-version`) and a MongoDB Atlas cluster (or a local MongoDB with `SEARCH_MODE=basic`).

```bash
npm install                       # installs all workspaces
cp .env.example .env              # then fill in the values (see below)
npm run dev:server                # API on http://localhost:3000
npm run dev:client                # Angular on http://localhost:4200 (proxies /api to :3000)
```

Other commands, all run from the repo root:

| Command                         | What it does                                                 |
| ------------------------------- | ------------------------------------------------------------ |
| `npm test`                      | Run all tests                                                |
| `npm run lint`                  | ESLint                                                       |
| `npm run typecheck`             | TypeScript type check                                        |
| `npm run build`                 | Build server and client                                      |
| `npm run format`                | Prettier                                                     |
| `npm run refresh:dev -w server` | Run one refresh of all stores against the database in `.env` |

## Environment variables

All configuration comes from environment variables. Locally they are read from `.env` in the repo root; on Render, set them in the dashboard. The server validates them at startup and refuses to start if any are missing or invalid.

| Variable                          | Required | Default                      | Description                                                                               |
| --------------------------------- | -------- | ---------------------------- | ----------------------------------------------------------------------------------------- |
| `NODE_ENV`                        |          | `development`                | `development`, `production` or `test`                                                     |
| `PORT`                            |          | `3000`                       | HTTP port (Render sets this automatically)                                                |
| `LOG_LEVEL`                       |          | `info`                       | Pino log level                                                                            |
| `TRUST_PROXY_HOPS`                |          | `1`                          | Proxies in front of the API whose `X-Forwarded-For` is trusted (for the login rate limit) |
| `CLIENT_DIST_DIR`                 |          | `client/dist/client/browser` | Built web app the server serves (only set it if the build lives elsewhere)                |
| `MONGODB_URI`                     | ✔        |                              | Atlas connection string, including the database name                                      |
| `SEARCH_MODE`                     |          | `atlas`                      | `atlas` (Atlas Search) or `basic` (fallback, no Atlas Search needed)                      |
| `SIGNUP_CODE`                     |          |                              | Invite code needed to create an account (≥ 8 chars); unset = nobody can sign up           |
| `SHARED_LISTS`                    |          |                              | Accounts sharing one shopping list: `a@x.si,b@y.si` (groups separated by `;`)             |
| `JWT_SECRET`                      | ✔        |                              | Secret for signing session tokens (≥ 32 chars)                                            |
| `SESSION_TTL_HOURS`               |          | `720`                        | How long a login lasts                                                                    |
| `LOGIN_RATE_LIMIT_MAX`            |          | `5`                          | Login attempts allowed per IP per window                                                  |
| `LOGIN_RATE_LIMIT_WINDOW_MINUTES` |          | `15`                         | Login rate-limit window                                                                   |
| `REFRESH_TOKEN`                   | ✔        |                              | Secret for the protected refresh endpoint (≥ 32 chars)                                    |
| `SCRAPER_USER_AGENT`              |          | see `.env.example`           | User-Agent sent to stores                                                                 |
| `SCRAPER_MIN_DELAY_MS`            |          | `2000`                       | Minimum delay between requests to one host                                                |
| `SCRAPER_CACHE_TTL_MINUTES`       |          | `60`                         | How long fetched responses are cached                                                     |

### Authentication setup

Everyone has their own account (email + password; only an argon2 hash of the password is stored). To let someone sign up, give them the invite code you set in `SIGNUP_CODE`; they choose _Imaš kodo za povabilo? Ustvari račun_ on the login page. Change the code whenever you like: existing accounts keep working. Without `SIGNUP_CODE` nobody can sign up.

Settings are per account. Each account has its own shopping list, except the accounts listed together in `SHARED_LISTS`, which share one (for example `you@gmail.com,partner@gmail.com`). The list page shows who it is shared with.

Generate `JWT_SECRET` and `REFRESH_TOKEN` with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Only `POST /api/auth/signup`, `POST /api/auth/login` and `GET /api/health` are public. All other endpoints require the session cookie (or, for the refresh endpoint, the `X-Refresh-Token` header).

The refresh job (GitHub Actions) only needs `MONGODB_URI` and, optionally, the `SCRAPER_*` and `LOG_LEVEL` variables.

## API

All responses are JSON. Offer lists return `{ items, total, page, pageSize }`; offers for the same product are one item with the others in `alsoAt`.

| Method and path                         | Auth                 | Description                                                                  |
| --------------------------------------- | -------------------- | ---------------------------------------------------------------------------- |
| `GET /api/health`                       | public               | Liveness check                                                               |
| `POST /api/auth/signup`                 | public, rate-limited | Body `{ "email", "password", "code" }`; creates the account, sets the cookie |
| `POST /api/auth/login`                  | public, rate-limited | Body `{ "email", "password" }`; sets the session cookie                      |
| `POST /api/auth/logout`                 | session              | Clears the session cookie                                                    |
| `GET /api/auth/me`                      | session              | `{ "email" }` if logged in, `401` otherwise                                  |
| `GET /api/offers`                       | session              | Search and filter all offers (query parameters below)                        |
| `GET /api/stores/:store/offers`         | session              | Offers of one store; same query parameters                                   |
| `GET /api/categories/:category/offers`  | session              | Offers in one category; same query parameters                                |
| `GET /api/stores`                       | session              | All stores, with the result of their last refresh                            |
| `GET /api/categories`                   | session              | Categories that have offers, with counts                                     |
| `GET /api/shopping-list`                | session              | The account's (or shared) list: `{ items, sharedWith }`                      |
| `PUT /api/shopping-list/items/:id`      | session              | Add or update an item (older writes than the stored one are ignored)         |
| `DELETE /api/shopping-list/items/:id`   | session              | Remove an item                                                               |
| `POST /api/shopping-list/clear-checked` | session              | Remove the crossed-off items                                                 |
| `GET` / `PUT /api/settings`             | session              | Preferred stores and hidden categories                                       |
| `POST /api/admin/refresh`               | `X-Refresh-Token`    | Starts a refresh in the background (`202`; `409` if one is already running)  |

Query parameters for offer lists:

| Parameter                             | Example         | Notes                                                                                                                                                            |
| ------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `q`                                   | `pralni prašek` | Text search, 2–100 characters, ignores diacritics                                                                                                                |
| `store`                               | `lidl,dm`       | One or more of `mercator`, `lidl`, `hofer`, `spar`, `dm`, `mueller`, `eurospin`, `tus`                                                                           |
| `category`                            | `drogerija`     | One of the category ids in `server/src/domain/categories.ts`                                                                                                     |
| `minDiscount`                         | `30`            | Minimum discount in %                                                                                                                                            |
| `sort`                                | `price`         | `relevance` (default when `q` is set), `discount` (default otherwise), `price`, `unitPrice` (€/kg, €/l or €/piece; offers without one last), `validTo`, `newest` |
| `excludeCategory`                     | `oblacila`      | Categories to leave out (ignored when `category` is set)                                                                                                         |
| `ean`                                 | `3838975531314` | Offers for one barcode                                                                                                                                           |
| `upcoming`                            | `true`          | Also offers that start later (default: only started ones)                                                                                                        |
| `deals`                               | `only` / `all`  | `only`: discounts only; `all`: also everyday catalogue prices. Default: `all` with `q` or `ean`, otherwise `only`                                                |
| `startedWithinDays`, `endsWithinDays` | `7`, `2`        | Offers that started / end within that many days                                                                                                                  |
| `page`, `pageSize`                    | `1`, `24`       | `pageSize` is at most 100                                                                                                                                        |

## Adding a new store adapter

1. Investigate how the store publishes its offers: a public JSON API, HTML pages, or an online/PDF flyer. Check `robots.txt` and prefer the most stable and least invasive source.
2. Save sample responses to `server/test/fixtures/<store>/`.
3. Create `server/src/adapters/<store>/` with an adapter implementing `StoreAdapter` (`fetchOffers(context): Promise<ScrapedOffer[]>`, see `server/src/adapters/store-adapter.ts`). Parsing goes in pure functions that take raw responses, so they can be tested against fixtures. Map the store's categories onto the shared category ids.
4. Make every HTTP request through the shared polite HTTP client. It handles robots.txt, rate limiting, User-Agent and caching. Never call `fetch` directly.
5. Register the adapter in `server/src/adapters/registry.ts`. No other core code changes.
6. Write parsing tests against the fixtures, and update the store table above.

## Deployment

### MongoDB Atlas

1. Create a free **M0** cluster in a European region (for example Frankfurt, `eu-central-1`).
2. **Database Access:** create a user with the `readWrite` role on the `reklame` database only, with a long random password.
3. **Network Access:** add `0.0.0.0/0`. Render's free tier and GitHub Actions runners have no fixed outbound IPs, so the strong database password is the protection here. If you later move to a paid Render plan, you can restrict access to the outbound IP ranges shown on the service's _Connect_ tab.
4. Copy the connection string (Connect → Drivers) into `MONGODB_URI`, with `/reklame` as the database path.
5. Run the refresh job once (`npm run refresh:dev -w server`). It creates the `offers` collection and its regular indexes, including the TTL index.
6. Create the Atlas Search index: **Atlas Search → Create Search Index → JSON Editor**, choose database `reklame` and collection `offers`, keep the default name `default`, and paste the `definition` object from [`server/src/db/atlas-search-index.json`](server/src/db/atlas-search-index.json). Until the index is ready, use `SEARCH_MODE=basic`.

### Render

The whole app runs as **one free Render Web Service**: Fastify serves the API under `/api` and the built Angular app for every other path. One service keeps the free instance hours (750 per month) comfortably within limits, and the browser only ever talks to one origin, so the session cookie can be `SameSite=Strict`.

**Dashboard → New → Web Service** → connect the GitHub repository.

| Field                        | Value                                                                      |
| ---------------------------- | -------------------------------------------------------------------------- |
| Name                         | `reklame-popusti` (the app will be `https://reklame-popusti.onrender.com`) |
| Language                     | Node (version from `.node-version`)                                        |
| Branch                       | `main`                                                                     |
| Region                       | Frankfurt (EU Central)                                                     |
| Root Directory               | _(empty)_                                                                  |
| Build Command                | `npm ci --include=dev && npm run build`                                    |
| Start Command                | `npm run start -w server`                                                  |
| Instance Type                | Free                                                                       |
| Health Check Path (Advanced) | `/api/health`                                                              |

`--include=dev` is needed because Render builds with `NODE_ENV=production`, which would otherwise skip TypeScript and the Angular CLI. `npm run build` builds both the server and the client.

**Environment variables:**

| Key                | Value                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------- |
| `NODE_ENV`         | `production`                                                                          |
| `SEARCH_MODE`      | `atlas`                                                                               |
| `TRUST_PROXY_HOPS` | `1`                                                                                   |
| `MONGODB_URI`      | the Atlas connection string                                                           |
| `SIGNUP_CODE`      | an invite code you make up (8+ characters); give it to the people who may sign up     |
| `SHARED_LISTS`     | optional: emails that share one shopping list, e.g. `you@gmail.com,partner@gmail.com` |
| `JWT_SECRET`       | _Generate_ (or a random string of 32+ characters)                                     |
| `REFRESH_TOKEN`    | _Generate_ (or a random string of 32+ characters)                                     |

Security headers (CSP, `X-Frame-Options`, `Referrer-Policy`, `X-Robots-Tag`, HSTS) and caching headers are set by the server, so nothing else needs configuring on Render.

After the first deploy:

- Open the app, log in, search. The first request after the service has slept takes up to a minute (the app says so).
- **Install on the phone:** Chrome (Android) → menu → _Install app_ / _Add to home screen_; Safari (iOS) → Share → _Add to Home Screen_. The installed app opens from its cache immediately and shows the last results while the server wakes up.
- **Check `TRUST_PROXY_HOPS`:** in the Render logs, a failed login logs `failed login attempt` with the client `ip`. If it shows your own public IP, the setting is right. If it shows a Render-internal address, all clients share one rate-limit bucket: safe, but you can raise the value by one and check again. Never set it higher than the number of proxies, or the IP can be faked.

Free web services sleep after about 15 minutes without traffic.

### Scheduled refresh

Render free web services sleep, so an in-process scheduler would not fire reliably. Instead, a **GitHub Actions scheduled workflow** ([`.github/workflows/refresh.yml`](.github/workflows/refresh.yml)) runs the refresh job directly against Atlas once a day at 04:05 UTC (timeout 150 minutes). Discounts last days, so once is enough, and Spar may only be visited until 08:45 UTC.

Setup: in the GitHub repo go to **Settings → Secrets and variables → Actions → New repository secret**, name it `MONGODB_URI`, and paste the same connection string as in `.env`. No other secrets are needed.

- To refresh manually: **Actions → Refresh offers → Run workflow**, or `POST /api/admin/refresh` with header `X-Refresh-Token: <REFRESH_TOKEN>`.
- A run fails (and GitHub emails you) when any store fails; the log shows which one and why.
- Expired offers are removed automatically by a MongoDB TTL index, so no cleanup job is needed.
- GitHub disables scheduled workflows in public repos after 60 days without repository activity. Re-enable it in the Actions tab if that happens.

## Scraping etiquette

This is a personal tool. Scrapers respect `robots.txt`, identify themselves with a clear User-Agent, wait at least `SCRAPER_MIN_DELAY_MS` between requests to the same host, cache responses, and run only a few times a day. A failing store is logged and skipped; it never stops the rest of the refresh.

## Roadmap

1. Scaffold ✔
2. Data model, API and auth ✔
3. First store adapter (Mercator) ✔
4. Frontend (login, search, filters, sorting, SL/EN) ✔
5. PWA and deployment ✔ (live at https://popusti.onrender.com)
6. Remaining store adapters: Lidl ✔, Hofer ✔, Spar ✔, Eurospin ✔, Tuš ✔
7. Shopping list, same product across stores, settings, start-page rows, barcode scanner, store health ✔
8. Optional: personal Lidl Plus coupons (on hold)
