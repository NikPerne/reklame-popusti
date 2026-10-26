import { describe, expect, it } from 'vitest';
import {
  HttpStatusError,
  PoliteHttpClient,
  RobotsDisallowedError,
} from '../../src/scraping/polite-http-client.js';

interface Site {
  robots?: string | number;
  pages: Record<string, string | number>;
}

/** Fake fetch + clock: `sleep` advances virtual time instead of waiting. */
function setup(site: Site, options: { minDelayMs?: number; cacheTtlMs?: number } = {}) {
  let clock = 0;
  const requests: { url: string; at: number; userAgent: string | null }[] = [];

  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : input.toString();
    requests.push({ url, at: clock, userAgent: new Headers(init?.headers).get('user-agent') });
    const path = new URL(url).pathname;
    const body = path === '/robots.txt' ? (site.robots ?? 404) : (site.pages[path] ?? 404);
    return typeof body === 'number'
      ? new Response('error', { status: body })
      : new Response(body, { status: 200 });
  };

  const client = new PoliteHttpClient({
    userAgent: 'test-bot/1.0',
    minDelayMs: options.minDelayMs ?? 1000,
    cacheTtlMs: options.cacheTtlMs ?? 60_000,
    fetch,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
  });

  return { client, requests, advance: (ms: number) => (clock += ms) };
}

describe('PoliteHttpClient', () => {
  it('sends its User-Agent and checks robots.txt once per origin', async () => {
    const { client, requests } = setup({ pages: { '/a': 'A', '/b': 'B' } });

    await client.fetchText('https://shop.test/a');
    await client.fetchText('https://shop.test/b');

    expect(requests.map((r) => new URL(r.url).pathname)).toEqual(['/robots.txt', '/a', '/b']);
    expect(requests.every((r) => r.userAgent === 'test-bot/1.0')).toBe(true);
  });

  it('refuses paths disallowed by robots.txt', async () => {
    const { client, requests } = setup({
      robots: 'User-agent: *\nDisallow: /private',
      pages: { '/private/x': 'secret' },
    });

    await expect(client.fetchText('https://shop.test/private/x')).rejects.toBeInstanceOf(
      RobotsDisallowedError,
    );
    expect(requests.map((r) => new URL(r.url).pathname)).toEqual(['/robots.txt']);
  });

  it('treats an unreachable robots.txt as disallow-all', async () => {
    const { client } = setup({ robots: 503, pages: { '/a': 'A' } });

    await expect(client.fetchText('https://shop.test/a')).rejects.toBeInstanceOf(
      RobotsDisallowedError,
    );
  });

  it('waits at least minDelayMs between requests to the same host', async () => {
    const { client, requests } = setup({ pages: { '/a': 'A', '/b': 'B', '/c': 'C' } });

    await Promise.all(['/a', '/b', '/c'].map((p) => client.fetchText(`https://shop.test${p}`)));

    const times = requests.map((r) => r.at);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(1000);
    }
  });

  it('honours a longer Crawl-delay from robots.txt', async () => {
    const { client, requests } = setup({
      robots: 'User-agent: *\nCrawl-delay: 5',
      pages: { '/a': 'A', '/b': 'B' },
    });

    await client.fetchText('https://shop.test/a');
    await client.fetchText('https://shop.test/b');

    expect(requests[2]!.at - requests[1]!.at).toBeGreaterThanOrEqual(5000);
  });

  it('serves repeated requests from the cache until the TTL expires', async () => {
    const { client, requests, advance } = setup({ pages: { '/a': 'A' } }, { cacheTtlMs: 10_000 });

    await client.fetchText('https://shop.test/a');
    await client.fetchText('https://shop.test/a');
    expect(requests).toHaveLength(2);

    advance(10_001);
    await client.fetchText('https://shop.test/a');
    expect(requests).toHaveLength(3);
  });

  it('retries a server error once, then gives up', async () => {
    const { client, requests } = setup({ pages: { '/down': 500 } });

    await expect(client.fetchText('https://shop.test/down')).rejects.toBeInstanceOf(
      HttpStatusError,
    );
    expect(requests.filter((r) => r.url.endsWith('/down'))).toHaveLength(2);
  });

  it('does not retry a 404', async () => {
    const { client, requests } = setup({ pages: {} });

    await expect(client.fetchText('https://shop.test/missing')).rejects.toMatchObject({
      status: 404,
    });
    expect(requests.filter((r) => r.url.endsWith('/missing'))).toHaveLength(1);
  });

  it('parses JSON responses', async () => {
    const { client } = setup({ pages: { '/api': '{"items":[1,2]}' } });

    await expect(client.fetchJson('https://shop.test/api')).resolves.toEqual({ items: [1, 2] });
  });
});

describe('PoliteHttpClient per-request delay', () => {
  it('waits longer when a request asks for it', async () => {
    const { client, requests } = setup({ pages: { '/a': 'A', '/b': 'B' } });

    await client.fetchText('https://shop.test/a', { minDelayMs: 10_000 });
    await client.fetchText('https://shop.test/b', { minDelayMs: 10_000 });

    expect(requests[2]!.at - requests[1]!.at).toBeGreaterThanOrEqual(10_000);
  });
});
