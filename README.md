# reklame-popusti

🛒 One search, every discount. A personal, installable PWA that collects current discounts and special offers from Slovenian retailers and lets you search them all in one place.

Search for a product such as `kava` or `pralni prašek` and see every current offer across stores: price, regular price, discount %, unit price, validity dates, store, image and a link to the source.

> **Status:** Live at https://popusti.onrender.com with Mercator, Lidl and Hofer offers (API, frontend, PWA, scheduled refresh). Next: Spar, Eurospin and Tuš. See the [Roadmap](#roadmap).

## Supported stores

| Store    | Adapter     | Data source                                                                                                                                                                                                                                                                                                                   |
| -------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mercator | ✔ done      | JSON endpoint behind the online shop's product grid (`mercatoronline.si/products/browseProducts/getProducts`), filtered to discounted products. About 3,500 offers, 45 requests per run. Online-shop prices, which usually match the stores.                                                                                  |
| Lidl     | ✔ done      | Weekly offer pages (`/c/<topic>/a<id>`, about 23, linked from the homepage) embed full product JSON (`data-grid-data`), including the Lidl Plus price. About 500 offers, ~24 requests per run. Includes weekly offers without an old price (shown without a discount %). Their JSON API needs authentication and is not used. |
| Hofer    | ✔ done      | "Pregled posebne ponudbe" listing (all current special offers, ~280, 60 per page) with the products in the page's embedded Nuxt payload (`__NUXT_DATA__`). Offer price and on-sale date only; Hofer publishes no regular price, so no discount %. The "Vse spuščene cene" (permanently lowered prices) list is not included.  |
| Spar     | planned     | Online shop `online.spar.si`, "Iz letaka" category; data inside the Next.js page payload. www.spar.si asks for 10 s between requests and visits 04:00–08:45 UTC only.                                                                                                                                                         |
| dm       | not planned | Offers only come from `product-search.services.dmtech.com`, whose robots.txt disallows everything.                                                                                                                                                                                                                            |
| Eurospin | planned     | `eurospin.si/akcije/`: one page with all ~390 offers as schema.org product cards (old/new price, size, unit price, validity).                                                                                                                                                                                                 |
| Tuš      | planned     | WooCommerce offer lists "Aktualno iz kataloga" and "Tuš Klub −50 %" (card price), with EAN, regular price and discount %; no validity dates in the lists. "Trajno znižano" and "Mojih 10" are not included.                                                                                                                   |
| Müller   | postponed   | No product offers online, only campaign texts and PDF leaflets.                                                                                                                                                                                                                                                               |

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

| Command                           | What it does                                                 |
| --------------------------------- | ------------------------------------------------------------ |
| `npm test`                        | Run all tests                                                |
| `npm run lint`                    | ESLint                                                       |
| `npm run typecheck`               | TypeScript type check                                        |
| `npm run build`                   | Build server and client                                      |
| `npm run format`                  | Prettier                                                     |
| `npm run refresh:dev -w server`   | Run one refresh of all stores against the database in `.env` |
| `npm run hash-password -w server` | Generate `APP_PASSWORD_HASH`                                 |

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
| `APP_PASSWORD_HASH`               | ✔        |                              | argon2 hash of the login password                                                         |
| `JWT_SECRET`                      | ✔        |                              | Secret for signing session tokens (≥ 32 chars)                                            |
| `SESSION_TTL_HOURS`               |          | `720`                        | How long a login lasts                                                                    |
| `LOGIN_RATE_LIMIT_MAX`            |          | `5`                          | Login attempts allowed per IP per window                                                  |
| `LOGIN_RATE_LIMIT_WINDOW_MINUTES` |          | `15`                         | Login rate-limit window                                                                   |
| `REFRESH_TOKEN`                   | ✔        |                              | Secret for the protected refresh endpoint (≥ 32 chars)                                    |
| `SCRAPER_USER_AGENT`              |          | see `.env.example`           | User-Agent sent to stores                                                                 |
| `SCRAPER_MIN_DELAY_MS`            |          | `2000`                       | Minimum delay between requests to one host                                                |
| `SCRAPER_CACHE_TTL_MINUTES`       |          | `60`                         | How long fetched responses are cached                                                     |

### Authentication setup

The app has a single user and a single password. Only the hash is stored:

```bash
npm run hash-password -w server   # prompts for a password, prints an argon2 hash
```

Put the hash in `APP_PASSWORD_HASH` (in single quotes in `.env`, because it contains `$`). Generate `JWT_SECRET` and `REFRESH_TOKEN` with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Only `POST /api/auth/login` and `GET /api/health` are public. All other endpoints require the session cookie (or, for the refresh endpoint, the `X-Refresh-Token` header).

The refresh job (GitHub Actions) only needs `MONGODB_URI` and, optionally, the `SCRAPER_*` and `LOG_LEVEL` variables.

## API

All responses are JSON. Offer lists return `{ items, total, page, pageSize }`.

| Method and path                        | Auth                 | Description                                                                 |
| -------------------------------------- | -------------------- | --------------------------------------------------------------------------- |
| `GET /api/health`                      | public               | Liveness check                                                              |
| `POST /api/auth/login`                 | public, rate-limited | Body `{ "password": "…" }`; sets the session cookie                         |
| `POST /api/auth/logout`                | session              | Clears the session cookie                                                   |
| `GET /api/auth/me`                     | session              | `200` if logged in, `401` otherwise                                         |
| `GET /api/offers`                      | session              | Search and filter all offers (query parameters below)                       |
| `GET /api/stores/:store/offers`        | session              | Offers of one store; same query parameters                                  |
| `GET /api/categories/:category/offers` | session              | Offers in one category; same query parameters                               |
| `GET /api/stores`                      | session              | All stores, with the result of their last refresh                           |
| `GET /api/categories`                  | session              | Categories that have offers, with counts                                    |
| `POST /api/admin/refresh`              | `X-Refresh-Token`    | Starts a refresh in the background (`202`; `409` if one is already running) |

Query parameters for offer lists:

| Parameter          | Example         | Notes                                                                                                                                                  |
| ------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `q`                | `pralni prašek` | Text search, 2–100 characters, ignores diacritics                                                                                                      |
| `store`            | `lidl,dm`       | One or more of `mercator`, `lidl`, `hofer`, `spar`, `dm`, `mueller`                                                                                    |
| `category`         | `drogerija`     | One of the category ids in `server/src/domain/categories.ts`                                                                                           |
| `minDiscount`      | `30`            | Minimum discount in %                                                                                                                                  |
| `sort`             | `price`         | `relevance` (default when `q` is set), `discount` (default otherwise), `price`, `unitPrice` (€/kg, €/l or €/piece; offers without one last), `validTo` |
| `page`, `pageSize` | `1`, `24`       | `pageSize` is at most 100                                                                                                                              |

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

| Key                 | Value                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`          | `production`                                                                                               |
| `SEARCH_MODE`       | `atlas`                                                                                                    |
| `TRUST_PROXY_HOPS`  | `1`                                                                                                        |
| `MONGODB_URI`       | the Atlas connection string                                                                                |
| `APP_PASSWORD_HASH` | the hash from `npm run hash-password -w server`, **without** the single quotes (those are only for `.env`) |
| `JWT_SECRET`        | _Generate_ (or a random string of 32+ characters)                                                          |
| `REFRESH_TOKEN`     | _Generate_ (or a random string of 32+ characters)                                                          |

Security headers (CSP, `X-Frame-Options`, `Referrer-Policy`, `X-Robots-Tag`, HSTS) and caching headers are set by the server, so nothing else needs configuring on Render.

After the first deploy:

- Open the app, log in, search. The first request after the service has slept takes up to a minute (the app says so).
- **Install on the phone:** Chrome (Android) → menu → _Install app_ / _Add to home screen_; Safari (iOS) → Share → _Add to Home Screen_. The installed app opens from its cache immediately and shows the last results while the server wakes up.
- **Check `TRUST_PROXY_HOPS`:** in the Render logs, a failed login logs `failed login attempt` with the client `ip`. If it shows your own public IP, the setting is right. If it shows a Render-internal address, all clients share one rate-limit bucket: safe, but you can raise the value by one and check again. Never set it higher than the number of proxies, or the IP can be faked.

Free web services sleep after about 15 minutes without traffic.

### Scheduled refresh

Render free web services sleep, so an in-process scheduler would not fire reliably. Instead, a **GitHub Actions scheduled workflow** ([`.github/workflows/refresh.yml`](.github/workflows/refresh.yml)) runs the refresh job directly against Atlas at 04:17, 10:17 and 16:17 UTC.

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
6. Remaining store adapters: Lidl ✔, Hofer ✔, then Spar, Eurospin, Tuš ← _next_
