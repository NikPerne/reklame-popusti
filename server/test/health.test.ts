import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

describe('GET /api/health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ NODE_ENV: 'test', LOG_LEVEL: 'error' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns ok without authentication', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok' });
  });
});
