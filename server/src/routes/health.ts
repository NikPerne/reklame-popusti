import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/health', { config: { auth: 'public' } }, async () => ({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
  }));
};
