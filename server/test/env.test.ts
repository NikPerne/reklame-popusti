import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';

const validEnv = {
  MONGODB_URI: 'mongodb+srv://user:pass@cluster0.example.mongodb.net/reklame',
  APP_PASSWORD_HASH: '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA',
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

  it('lists every invalid variable in one error', () => {
    expect(() => loadEnv({ ...validEnv, MONGODB_URI: 'http://nope', JWT_SECRET: 'short' })).toThrow(
      /MONGODB_URI[\s\S]*JWT_SECRET/,
    );
  });
});
