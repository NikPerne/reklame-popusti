import type { FastifyPluginAsync } from 'fastify';
import type { RefreshTrigger } from '../jobs/refresh-runner.js';

export const adminRoutes: FastifyPluginAsync<{ refreshTrigger: RefreshTrigger }> = async (
  app,
  { refreshTrigger },
) => {
  /** Starts a refresh in the background. Needs the X-Refresh-Token header. */
  app.post('/api/admin/refresh', { config: { auth: 'refresh-token' } }, async (_request, reply) => {
    if (!refreshTrigger.start()) {
      return reply.conflict('A refresh is already running');
    }
    return reply.code(202).send({ started: true });
  });
};
