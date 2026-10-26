import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';

const validEnv = {
  MONGODB_URI: 'mongodb+srv://user:pass@cluster0.example.mongodb.net/reklame',
  JWT_SECRET: 'x'.repeat(32),
  REFRESH_TOKEN: 'y'.repeat(32),
};

describe('loadEnv', () => {
  it('applies defaults to a minimal valid environment', () => {
    const env = loadEnv(validEnv);

    expect(env.PORT).toBe(3000);
    expect(env.SEARCH_MODE).toBe('atlas');
    expect(env.SCRAPER_MIN_DELAY_MS).toBe(2000);
  });

  it('parses SHARED_LISTS into lower-case groups', () => {
    const env = loadEnv({ ...validEnv, SHARED_LISTS: ' B@x.si, a@x.si ; c@x.si,d@x.si;' });

    expect(env.SHARED_LISTS).toEqual([
      ['a@x.si', 'b@x.si'],
      ['c@x.si', 'd@x.si'],
    ]);
    expect(loadEnv(validEnv).SHARED_LISTS).toEqual([]);
  });

  it('rejects SHARED_LISTS with bad emails or an email in two groups', () => {
    expect(() => loadEnv({ ...validEnv, SHARED_LISTS: 'a@x.si,nope' })).toThrow(/SHARED_LISTS/);
    expect(() => loadEnv({ ...validEnv, SHARED_LISTS: 'a@x.si,b@x.si;a@x.si,c@x.si' })).toThrow(
      /more than one group/,
    );
  });

  it('lists every invalid variable in one error', () => {
    expect(() => loadEnv({ ...validEnv, MONGODB_URI: 'http://nope', JWT_SECRET: 'short' })).toThrow(
      /MONGODB_URI[\s\S]*JWT_SECRET/,
    );
  });
});
