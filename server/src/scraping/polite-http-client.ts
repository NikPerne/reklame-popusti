import robotsParserModule from 'robots-parser';

// The package's types declare an ES default export, but it is CommonJS (`module.exports = fn`).
const robotsParser = robotsParserModule as unknown as typeof robotsParserModule.default;

export interface RequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  /** A longer gap to this host than the client's default, when the site asks for one. */
  minDelayMs?: number;
}

/** The only way adapters may talk to store websites. */
export interface HttpClient {
  fetchText(url: string, options?: RequestOptions): Promise<string>;
  fetchJson(url: string, options?: RequestOptions): Promise<unknown>;
}

export class RobotsDisallowedError extends Error {
  constructor(readonly url: string) {
    super(`robots.txt disallows ${url}`);
    this.name = 'RobotsDisallowedError';
  }
}

export class HttpStatusError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpStatusError';
  }
}

export class TooManyRedirectsError extends Error {
  constructor(readonly chain: string[]) {
    super(`too many redirects: ${chain.join(' -> ')}`);
    this.name = 'TooManyRedirectsError';
  }
}

const MAX_REDIRECTS = 10;

export interface PoliteHttpClientOptions {
  userAgent: string;
  /** Minimum gap between two requests to the same host. */
  minDelayMs: number;
  cacheTtlMs: number;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

type Robots = ReturnType<typeof robotsParser>;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function isRetryable(error: unknown): boolean {
  if (error instanceof HttpStatusError) return error.status === 429 || error.status >= 500;
  return !(error instanceof RobotsDisallowedError || error instanceof TooManyRedirectsError);
}

/**
 * Polite HTTP client: checks robots.txt, sends one request at a time per host with at least
 * `minDelayMs` (or the robots.txt Crawl-delay, if longer) between them, identifies itself with a clear User-Agent, caches responses for
 * `cacheTtlMs`, times out every request and retries at most once with backoff.
 */
export class PoliteHttpClient implements HttpClient {
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly cache = new Map<string, { body: string; expiresAt: number }>();
  private readonly robots = new Map<string, Promise<Robots>>();
  /** Tail of each host's request queue and when its last request started. */
  private readonly hostQueues = new Map<string, Promise<unknown>>();
  private readonly lastRequestAt = new Map<string, number>();
  /** Cookies each host set, sent back like a browser would (some sites redirect until they get one). */
  private readonly cookies = new Map<string, Map<string, string>>();

  constructor(private readonly options: PoliteHttpClientOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  async fetchJson(url: string, options: RequestOptions = {}): Promise<unknown> {
    const text = await this.fetchText(url, {
      ...options,
      headers: { accept: 'application/json', ...options.headers },
    });
    return JSON.parse(text) as unknown;
  }

  async fetchText(url: string, options: RequestOptions = {}): Promise<string> {
    const cacheKey = `${options.method ?? 'GET'} ${url} ${options.body ?? ''}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > this.now()) return cached.body;

    const robots = await this.robotsFor(new URL(url).origin);
    if (robots.isDisallowed(url, this.options.userAgent)) throw new RobotsDisallowedError(url);

    const crawlDelayMs = (robots.getCrawlDelay(this.options.userAgent) ?? 0) * 1000;
    const delayMs = Math.max(this.options.minDelayMs, crawlDelayMs, options.minDelayMs ?? 0);
    const body = await this.withRetry(() => this.request(url, options, delayMs));
    this.cache.set(cacheKey, { body, expiresAt: this.now() + this.options.cacheTtlMs });
    return body;
  }

  private robotsFor(origin: string): Promise<Robots> {
    let robots = this.robots.get(origin);
    if (!robots) {
      robots = this.loadRobots(origin);
      this.robots.set(origin, robots);
    }
    return robots;
  }

  private async loadRobots(origin: string): Promise<Robots> {
    const robotsUrl = `${origin}/robots.txt`;
    try {
      const text = await this.withRetry(() => this.request(robotsUrl, {}, this.options.minDelayMs));
      return robotsParser(robotsUrl, text);
    } catch (error) {
      // RFC 9309: a missing robots.txt (4xx) allows everything; unreachable (5xx/network) allows nothing.
      if (error instanceof HttpStatusError && error.status >= 400 && error.status < 500) {
        return robotsParser(robotsUrl, '');
      }
      this.robots.delete(origin);
      return robotsParser(robotsUrl, 'User-agent: *\nDisallow: /');
    }
  }

  private async withRetry(request: () => Promise<string>): Promise<string> {
    try {
      return await request();
    } catch (error) {
      if (!isRetryable(error)) throw error;
      await this.sleep(this.options.minDelayMs * 2);
      return request();
    }
  }

  /** Queues the request behind earlier requests to the same host. */
  private request(url: string, options: RequestOptions, delayMs: number): Promise<string> {
    const host = new URL(url).host;
    const previous = this.hostQueues.get(host) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        const wait = (this.lastRequestAt.get(host) ?? -Infinity) + delayMs - this.now();
        if (wait > 0) await this.sleep(wait);
        this.lastRequestAt.set(host, this.now());
        return this.send(url, options);
      });
    this.hostQueues.set(host, next);
    return next;
  }

  /** Follows redirects itself so cookies set along the way are kept and each hop obeys robots.txt. */
  private async send(url: string, options: RequestOptions): Promise<string> {
    const chain = [url];
    let current = url;
    let method = options.method ?? 'GET';
    let body = options.body;

    for (;;) {
      const host = new URL(current).host;
      const cookie = this.cookieHeader(host);
      const response = await this.fetchImpl(current, {
        method,
        headers: {
          'user-agent': this.options.userAgent,
          ...options.headers,
          ...(cookie && { cookie }),
        },
        ...(body !== undefined && { body }),
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      this.storeCookies(host, response.headers);

      const location = response.headers.get('location');
      if (response.status < 300 || response.status >= 400 || !location) {
        if (!response.ok) throw new HttpStatusError(current, response.status);
        return response.text();
      }

      await response.body?.cancel();
      if (chain.length > MAX_REDIRECTS) throw new TooManyRedirectsError(chain);
      current = new URL(location, current).toString();
      chain.push(current);
      const robots = await this.robotsFor(new URL(current).origin);
      if (robots.isDisallowed(current, this.options.userAgent)) {
        throw new RobotsDisallowedError(current);
      }
      // Like browsers: 307/308 repeat the request, the others turn it into a GET.
      if (response.status !== 307 && response.status !== 308) {
        method = 'GET';
        body = undefined;
      }
    }
  }

  private cookieHeader(host: string): string | undefined {
    const jar = this.cookies.get(host);
    if (!jar?.size) return undefined;
    return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  private storeCookies(host: string, headers: Headers): void {
    for (const setCookie of headers.getSetCookie()) {
      const [pair = ''] = setCookie.split(';');
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      let jar = this.cookies.get(host);
      if (!jar) this.cookies.set(host, (jar = new Map<string, string>()));
      jar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
    }
  }
}
