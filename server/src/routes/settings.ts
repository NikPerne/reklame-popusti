import type { FastifyPluginAsync } from 'fastify';
import { settingsSchema } from '../domain/settings.js';
import { parseOrBadRequest } from '../lib/validation.js';
import type { SettingsRepository } from '../repositories/settings-repository.js';

export const settingsRoutes: FastifyPluginAsync<{ settings: SettingsRepository }> = async (
  app,
  { settings },
) => {
  app.get('/api/settings', async () => settings.get());

  /** Returns the stored settings, which are the server's if they were newer. */
  app.put('/api/settings', async (request) =>
    settings.save(parseOrBadRequest(settingsSchema, request.body)),
  );
};
