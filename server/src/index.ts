import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { adapters } from './adapters/registry.js';
import { buildApp } from './app.js';
import { loadDotEnvFile, loadEnv } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './db/connect.js';
import { refreshFlyers } from './jobs/flyer-refresh.js';
import { runRefresh } from './jobs/refresh-runner.js';
import { flyerSources } from './flyers/flyer-sources.js';
import { MongoFlyerRepository } from './repositories/flyer-repository.js';
import { MongoOfferRepository } from './repositories/mongo-offer-repository.js';
import { MongoPriceHistoryRepository } from './repositories/price-history-repository.js';
import { MongoSettingsRepository } from './repositories/settings-repository.js';
import { MongoShoppingListRepository } from './repositories/shopping-list-repository.js';
import { MongoUserRepository } from './repositories/user-repository.js';
import { createHttpClient } from './scraping/create-http-client.js';

loadDotEnvFile();
const env = loadEnv();

await connectDatabase(env.MONGODB_URI);
const repository = new MongoOfferRepository(env.SEARCH_MODE);
const history = new MongoPriceHistoryRepository();
const flyers = new MongoFlyerRepository();

// One Render service serves both the API and the built web app (when it has been built).
const clientRoot =
  env.CLIENT_DIST_DIR ?? resolve(import.meta.dirname, '../../client/dist/client/browser');
const clientBuilt = existsSync(resolve(clientRoot, 'index.html'));

const app = await buildApp({
  env,
  repository,
  history,
  flyers,
  users: new MongoUserRepository(),
  shoppingList: new MongoShoppingListRepository(),
  settings: new MongoSettingsRepository(),
  refresh: async (log) => {
    const http = createHttpClient(env);
    const summary = await runRefresh({ adapters, repository, history, http, log });
    await refreshFlyers({ sources: flyerSources, repository: flyers, http, log });
    return summary;
  },
  ...(clientBuilt && { clientRoot }),
});
if (!clientBuilt) {
  app.log.warn({ clientRoot }, 'web app not built; serving the API only');
}

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await disconnectDatabase();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: env.PORT, host: '0.0.0.0' });
