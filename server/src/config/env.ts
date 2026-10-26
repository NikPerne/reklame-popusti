import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  MONGODB_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\//, 'must be a mongodb:// or mongodb+srv:// connection string'),
  /** `atlas` uses the Atlas Search index; `basic` uses a regex on the diacritic-free searchText field. */
  SEARCH_MODE: z.enum(['atlas', 'basic']).default('atlas'),

  /** argon2 hash of the single user's password (generate with `npm run hash-password -w server`). */
  APP_PASSWORD_HASH: z.string().startsWith('$argon2', 'must be an argon2 hash'),
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

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
