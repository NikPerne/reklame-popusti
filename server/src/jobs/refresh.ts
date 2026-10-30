/**
 * CLI entry for the scheduled refresh (GitHub Actions): `npm run refresh -w server`.
 * Exits with code 1 if any store failed, so the workflow run shows up as failed.
 */
import { pino } from 'pino';
import { adapters } from '../adapters/registry.js';
import { loadDotEnvFile, loadRefreshEnv } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../db/connect.js';
import { OfferModel, StoreStatusModel } from '../db/models.js';
import { MongoOfferRepository } from '../repositories/mongo-offer-repository.js';
import { createHttpClient } from '../scraping/create-http-client.js';
import { runRefresh } from './refresh-runner.js';

loadDotEnvFile();
const env = loadRefreshEnv();
const log = pino({ level: env.LOG_LEVEL });

await connectDatabase(env.MONGODB_URI);
try {
  // Creates the TTL and unique indexes on a fresh database; a no-op afterwards.
  await Promise.all([OfferModel.syncIndexes(), StoreStatusModel.syncIndexes()]);

  const summary = await runRefresh({
    adapters,
    // The search mode only affects reads, so the default is fine for the job.
    repository: new MongoOfferRepository('atlas'),
    http: createHttpClient(env),
    log,
    ...(env.REFRESH_ONLY_STALE_HOURS !== undefined && {
      onlyStaleAfterHours: env.REFRESH_ONLY_STALE_HOURS,
    }),
  });

  const failed = summary.results.filter((r) => !r.ok);
  log.info(
    {
      stores: summary.results.length,
      failed: failed.map((r) => r.store),
      durationMs: summary.finishedAt.getTime() - summary.startedAt.getTime(),
    },
    'refresh finished',
  );
  process.exitCode = failed.length > 0 ? 1 : 0;
} finally {
  await disconnectDatabase();
}
