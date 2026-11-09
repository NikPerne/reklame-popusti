import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { currentFlyers, isFlyerFileUrl } from '../domain/flyer.js';
import { STORE_IDS } from '../domain/stores.js';
import { parseOrBadRequest } from '../lib/validation.js';
import type { FlyerRepository } from '../repositories/flyer-repository.js';

const idParamsSchema = z.object({ id: z.string().min(1).max(130) });

/** One range request of pdf.js (it asks for about 1 MB at a time); the whole file may be slower. */
const PDF_TIMEOUT_MS = 60_000;

/** Response headers passed on from the store, so pdf.js can load the PDF in ranges. */
const PASSED_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges'];

export const flyerRoutes: FastifyPluginAsync<{
  flyers: FlyerRepository;
  userAgent: string;
  fetch?: typeof globalThis.fetch;
}> = async (app, { flyers, userAgent, fetch = globalThis.fetch }) => {
  /** Flyers that have not ended, by store (in the app's store order), soonest first. */
  app.get('/api/flyers', async () => {
    // The sort is stable, so each store's flyers stay soonest first.
    return currentFlyers(await flyers.list(), new Date()).sort(
      (a, b) => STORE_IDS.indexOf(a.store) - STORE_IDS.indexOf(b.store),
    );
  });

  /** One flyer with its pages (the in-app viewer). */
  app.get('/api/flyers/:id', async (request, reply) => {
    const { id } = parseOrBadRequest(idParamsSchema, request.params);
    return (await flyers.findById(id)) ?? reply.notFound('Flyer not found');
  });

  /**
   * A PDF flyer (Tuš), passed through so the app can draw it with pdf.js: tus.si allows
   * neither framing nor cross-origin reads. Only stored flyers' files on allowed hosts are
   * fetched, and pdf.js's Range header is passed on, so a viewer loads only what it shows.
   */
  app.get('/api/flyers/:id/pdf', async (request, reply) => {
    const { id } = parseOrBadRequest(idParamsSchema, request.params);
    const flyer = await flyers.findById(id);
    if (flyer?.viewer !== 'pdf' || !isFlyerFileUrl(flyer.url)) {
      return reply.notFound('Flyer not found');
    }

    // Stop reading from the store when the viewer goes away (pdf.js cancels its first, whole-file
    // request once it knows ranges work). The response's close also comes after a normal finish.
    const abort = new AbortController();
    reply.raw.once('close', () => {
      abort.abort();
    });
    const range = request.headers.range;
    const upstream = await fetch(flyer.url, {
      headers: { 'user-agent': userAgent, ...(range && { range }) },
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(PDF_TIMEOUT_MS)]),
    });
    if ((upstream.status !== 200 && upstream.status !== 206) || !upstream.body) {
      await upstream.body?.cancel();
      return reply.badGateway(`The store answered ${upstream.status}`);
    }

    reply.code(upstream.status);
    for (const name of PASSED_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) reply.header(name, value);
    }
    // The flyer's file doesn't change; the browser may keep the parts it has read.
    reply.header('cache-control', 'private, max-age=86400');
    return reply.send(Readable.fromWeb(upstream.body as WebReadableStream<Uint8Array>));
  });
};
