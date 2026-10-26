import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { parseSharedLists } from '../domain/account.js';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /**
   * Number of proxies in front of the server whose X-Forwarded-For entries are trusted.
   * Too low is safe (all clients share one rate-limit key); too high lets clients spoof their IP.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(1),

  /** Built Angular app to serve; defaults to client/dist/client/browser in the repo. */
  CLIENT_DIST_DIR: z.string().min(1).optional(),

  MONGODB_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\//, 'must be a mongodb:// or mongodb+srv:// connection string'),
  /** `atlas` uses the Atlas Search index; `basic` uses a regex on the diacritic-free searchText field. */
  SEARCH_MODE: z.enum(['atlas', 'basic']).default('atlas'),

  /** Invite code needed to create an account; without it nobody can sign up. */
  SIGNUP_CODE: z.string().min(8, 'must be at least 8 characters').optional(),
  /**
   * Accounts that share one shopping list: emails separated by commas, groups by semicolons,
   * e.g. `a@x.si,b@y.si; c@z.si,d@w.si`. Kept out of the code because the repo is public.
   */
  SHARED_LISTS: z
    .string()
    .default('')
    .transform((value, ctx) => {
      const groups = parseSharedLists(value);
      if (groups instanceof Error) {
        ctx.addIssue({ code: 'custom', message: groups.message });
        return z.NEVER;
      }
      return groups;
    }),
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(720),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().positive().default(15),

  /** Shared secret for POST /api/admin/refresh (sent as X-Refresh-Token). */
  REFRESH_TOKEN: z.string().min(32, 'must be at least 32 characters'),

  SCRAPER_USER_AGENT: z
    .string()
    .default(
      'reklame-popusti/0.1 (personal price comparison; +https://github.com/NikPerne/reklame-popusti)',
    ),
  SCRAPER_MIN_DELAY_MS: z.coerce.number().int().min(500).default(2000),
  SCRAPER_CACHE_TTL_MINUTES: z.coerce.number().int().nonnegative().default(60),
});

/** The refresh job (GitHub Actions) only needs the database and scraper settings. */
const refreshEnvSchema = envSchema.pick({
  NODE_ENV: true,
  LOG_LEVEL: true,
  MONGODB_URI: true,
  SCRAPER_USER_AGENT: true,
  SCRAPER_MIN_DELAY_MS: true,
  SCRAPER_CACHE_TTL_MINUTES: true,
});

export type Env = z.infer<typeof envSchema>;
export type RefreshEnv = z.infer<typeof refreshEnvSchema>;

function parseEnv<T extends z.ZodType>(schema: T, source: NodeJS.ProcessEnv): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return parseEnv(envSchema, source);
}

export function loadRefreshEnv(source: NodeJS.ProcessEnv = process.env): RefreshEnv {
  return parseEnv(refreshEnvSchema, source);
}

/** Local development reads the repo-root .env; on Render and in CI variables are set directly. */
export function loadDotEnvFile(): void {
  const envFile = resolve(import.meta.dirname, '../../../.env');
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
}
