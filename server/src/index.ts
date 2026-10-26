import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';

// Local development reads the repo-root .env; on Render variables come from the dashboard.
const envFile = resolve(import.meta.dirname, '../../.env');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const env = loadEnv();
const app = await buildApp(env);

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: env.PORT, host: '0.0.0.0' });
