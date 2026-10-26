import type { FastifyPluginAsync } from 'fastify';
import { settingsSchema } from '../domain/settings.js';
import { parseOrBadRequest } from '../lib/validation.js';
import type { SettingsRepository } from '../repositories/settings-repository.js';

/** The logged-in user's own settings. */
export const settingsRoutes: FastifyPluginAsync<{ settings: SettingsRepository }> = async (
  app,
  { settings },
) => {
  app.get('/api/settings', async (request) => settings.get(request.user.sub));

  /** Returns the stored settings, which are the server's if they were newer. */
  app.put('/api/settings', async (request) =>
    settings.save(request.user.sub, parseOrBadRequest(settingsSchema, request.body)),
  );
};
