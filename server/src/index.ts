import { adapters } from './adapters/registry.js';
import { buildApp } from './app.js';
import { loadDotEnvFile, loadEnv } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './db/connect.js';
import { runRefresh } from './jobs/refresh-runner.js';
import { MongoOfferRepository } from './repositories/mongo-offer-repository.js';
import { createHttpClient } from './scraping/create-http-client.js';

loadDotEnvFile();
const env = loadEnv();

await connectDatabase(env.MONGODB_URI);
const repository = new MongoOfferRepository(env.SEARCH_MODE);

const app = await buildApp({
  env,
  repository,
  refresh: (log) => runRefresh({ adapters, repository, http: createHttpClient(env), log }),
});

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await disconnectDatabase();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: env.PORT, host: '0.0.0.0' });
