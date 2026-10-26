# reklame-popusti

🛒 One search, every discount. A personal, installable PWA that collects current discounts and special offers from Slovenian retailers and lets you search them all in one place.

Search for a product such as `kava` or `pralni prašek` and see every current offer across stores: price, regular price, discount %, unit price, validity dates, store, image and a link to the source.

> **Status:** Phase 1 (scaffold) is complete: the server skeleton with its health check and an empty Angular app. Data model, auth, adapters, frontend and PWA come in later phases (see [Roadmap](#roadmap)).

## Supported stores

| Store    | Adapter | Data source        |
| -------- | ------- | ------------------ |
| Mercator | planned | to be investigated |
| Lidl     | planned | to be investigated |
| Hofer    | planned | to be investigated |
| Spar     | planned | to be investigated |
| dm       | planned | to be investigated |
| Müller   | planned | to be investigated |

Each store's data source (public JSON endpoint, HTML page or online flyer) is investigated and documented here before its adapter is written.

## Tech stack

- **Backend:** Node.js 24, TypeScript (strict), [Fastify](https://fastify.dev), Mongoose, zod
- **Frontend:** Angular 22, installable PWA (service worker + manifest), Transloco (Slovenian UI with an English switch)
- **Database:** MongoDB Atlas (M0 free tier) with Atlas Search for diacritic-insensitive search
- **Hosting:** Render free tier (web service for the API, static site for the frontend)
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

| Command             | What it does            |
| ------------------- | ----------------------- |
| `npm test`          | Run all tests           |
| `npm run lint`      | ESLint                  |
| `npm run typecheck` | TypeScript type check   |
| `npm run build`     | Build server and client |
| `npm run format`    | Prettier                |

## Environment variables

All configuration comes from environment variables. Locally they are read from `.env` in the repo root; on Render, set them in the dashboard. The server validates them at startup and refuses to start if any are missing or invalid.

| Variable                          | Required | Default            | Description                                                          |
| --------------------------------- | -------- | ------------------ | -------------------------------------------------------------------- |
| `NODE_ENV`                        |          | `development`      | `development`, `production` or `test`                                |
| `PORT`                            |          | `3000`             | HTTP port (Render sets this automatically)                           |
| `LOG_LEVEL`                       |          | `info`             | Pino log level                                                       |
| `MONGODB_URI`                     | ✔        |                    | Atlas connection string, including the database name                 |
| `SEARCH_MODE`                     |          | `atlas`            | `atlas` (Atlas Search) or `basic` (fallback, no Atlas Search needed) |
| `APP_PASSWORD_HASH`               | ✔        |                    | argon2 hash of the login password                                    |
| `JWT_SECRET`                      | ✔        |                    | Secret for signing session tokens (≥ 32 chars)                       |
| `SESSION_TTL_HOURS`               |          | `720`              | How long a login lasts                                               |
| `LOGIN_RATE_LIMIT_MAX`            |          | `5`                | Failed logins allowed per IP per window                              |
| `LOGIN_RATE_LIMIT_WINDOW_MINUTES` |          | `15`               | Login rate-limit window                                              |
| `REFRESH_TOKEN`                   | ✔        |                    | Secret for the protected refresh endpoint (≥ 32 chars)               |
| `SCRAPER_USER_AGENT`              |          | see `.env.example` | User-Agent sent to stores                                            |
| `SCRAPER_MIN_DELAY_MS`            |          | `2000`             | Minimum delay between requests to one host                           |
| `SCRAPER_CACHE_TTL_MINUTES`       |          | `60`               | How long fetched responses are cached                                |

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

## Adding a new store adapter

1. Investigate how the store publishes its offers: a public JSON API, HTML pages, or an online/PDF flyer. Check `robots.txt` and prefer the most stable and least invasive source.
2. Save sample responses to `server/test/fixtures/<store>/`.
3. Create `server/src/adapters/<store>/` with an adapter implementing `StoreAdapter` (`fetchOffers(): Promise<Offer[]>`). Parsing goes in pure functions that take raw responses, so they can be tested against fixtures.
4. Make every HTTP request through the shared polite HTTP client. It handles robots.txt, rate limiting, User-Agent and caching. Never call `fetch` directly.
5. Register the adapter in the adapter registry. No other core code changes.
6. Write parsing tests against the fixtures, and update the store table above.

## Deployment

### MongoDB Atlas

1. Create a free **M0** cluster in a European region (for example Frankfurt, `eu-central-1`).
2. **Database Access:** create a user with the `readWrite` role on the `reklame` database only, with a long random password.
3. **Network Access:** add `0.0.0.0/0`. Render's free tier and GitHub Actions runners have no fixed outbound IPs, so the strong database password is the protection here. If you later move to a paid Render plan, you can restrict access to the outbound IP ranges shown on the service's _Connect_ tab.
4. Copy the connection string (Connect → Drivers) into `MONGODB_URI`, with `/reklame` as the database path.
5. Create the Atlas Search index from the definition file in the repo (added in Phase 2).

### Render

Both services connect to this repo. Node version comes from `.node-version`.

**API (Web Service, free):**

- Build command: `npm ci && npm run build -w server`
- Start command: `npm run start -w server`
- Health check path: `/api/health`
- Environment: every required variable above, plus `NODE_ENV=production`

**Frontend (Static Site):**

- Build command: `npm ci && npm run build -w client`
- Publish directory: `client/dist/client/browser`
- Redirects/Rewrites, in this order:
  1. `/api/*` → `https://<your-api>.onrender.com/api/*` (Rewrite). This proxies the API through the static site so browser and API share one origin and the session cookie can be `SameSite=Strict`.
  2. `/*` → `/index.html` (Rewrite), for Angular routing.

Free web services sleep after about 15 minutes without traffic. The first request after that takes roughly a minute while the service starts.

### Scheduled refresh

Render free web services sleep, so an in-process scheduler would not fire reliably. Instead, a **GitHub Actions scheduled workflow** (`.github/workflows/refresh.yml`, added in Phase 6) runs the refresh job directly against Atlas a few times a day. The workflow needs the repository secret `MONGODB_URI`.

- To refresh manually: `POST /api/admin/refresh` with header `X-Refresh-Token: <REFRESH_TOKEN>`, or run the workflow from the GitHub Actions tab.
- Expired offers are removed automatically by a MongoDB TTL index, so no cleanup job is needed.
- GitHub disables scheduled workflows in public repos after 60 days without repository activity. Re-enable it in the Actions tab if that happens.

## Scraping etiquette

This is a personal tool. Scrapers respect `robots.txt`, identify themselves with a clear User-Agent, wait at least `SCRAPER_MIN_DELAY_MS` between requests to the same host, cache responses, and run only a few times a day. A failing store is logged and skipped; it never stops the rest of the refresh.

## Roadmap

1. Scaffold ✔
2. Data model, API and auth ← _next_
3. First store adapter end to end
4. Frontend (login, search, filters, sorting, SL/EN)
5. Remaining store adapters
6. PWA and deployment
