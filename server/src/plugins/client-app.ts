import { basename, extname } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

/** Files the browser must always revalidate, or app updates would never reach it. */
const ALWAYS_REVALIDATE = new Set([
  'index.html',
  'ngsw.json',
  'ngsw-worker.js',
  'safety-worker.js',
  'worker-basic.min.js',
  'manifest.webmanifest',
]);
/** Angular's content-hashed bundles, e.g. main-7MAUWQK5.js. */
const HASHED_ASSET = /-[A-Z0-9]{8}\.(?:js|css)$/;

function cacheControlFor(filePath: string): string {
  const name = basename(filePath);
  if (ALWAYS_REVALIDATE.has(name)) return 'no-cache';
  if (HASHED_ASSET.test(name)) return 'public, max-age=31536000, immutable';
  return 'public, max-age=3600';
}

/**
 * Serves the built Angular app (client/dist/client/browser) from the API server, so the whole
 * app is one Render web service. Paths without a file extension that aren't API routes get
 * index.html, so Angular routes like /login work on reload. Everything here is public; the
 * auth hook only guards /api.
 */
export const clientAppPlugin = fp(
  async (app: FastifyInstance, { root }: { root: string }) => {
    await app.register(fastifyStatic, {
      root,
      index: false,
      cacheControl: false,
      setHeaders: (reply, filePath) => {
        void reply.header('cache-control', cacheControlFor(filePath));
      },
    });

    app.get('/', async (_request, reply) => reply.sendFile('index.html'));

    app.setNotFoundHandler(async (request, reply) => {
      const path = request.url.split('?')[0] ?? '/';
      const isAppRoute =
        (request.method === 'GET' || request.method === 'HEAD') &&
        !path.startsWith('/api/') &&
        extname(path) === '';
      if (isAppRoute) return reply.sendFile('index.html');
      return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
    });
  },
  { name: 'client-app' },
);
