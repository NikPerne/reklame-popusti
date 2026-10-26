/**
 * Decoder for the `__NUXT_DATA__` payload that Nuxt 3 sites (e.g. Hofer) embed in their HTML.
 * The payload is "devalue" flat format: one JSON array where every value refers to others by
 * index, and some arrays are tagged (["Reactive", 5], ["Date", "2026-..."], ...).
 */

/** Tags that only wrap another value. */
const WRAPPERS = new Set([
  'Reactive',
  'ShallowReactive',
  'Ref',
  'ShallowRef',
  'skipHydrate',
  'NuxtError',
  'Island',
]);

/** devalue's special indices. */
const SPECIAL: Record<number, unknown> = {
  [-1]: undefined,
  [-2]: undefined, // array hole
  [-3]: Number.NaN,
  [-4]: Number.POSITIVE_INFINITY,
  [-5]: Number.NEGATIVE_INFINITY,
  [-6]: -0,
};

export function hydrateDevalue(flat: unknown[]): unknown {
  const cache = new Map<number, unknown>();

  const hydrate = (index: unknown): unknown => {
    if (typeof index !== 'number') return index;
    if (index < 0) return SPECIAL[index];
    if (cache.has(index)) return cache.get(index);

    const value = flat[index];
    if (value === null || typeof value !== 'object') {
      cache.set(index, value);
      return value;
    }

    if (Array.isArray(value)) {
      const [tag, ...args] = value as unknown[];
      if (typeof tag === 'string') {
        if (WRAPPERS.has(tag)) return hydrate(args[0]);
        switch (tag) {
          case 'EmptyRef':
          case 'EmptyShallowRef':
            return undefined;
          case 'Date':
            return new Date(String(args[0]));
          case 'RegExp':
            return new RegExp(String(args[0]), typeof args[1] === 'string' ? args[1] : '');
          case 'BigInt':
            return BigInt(String(args[0]));
          case 'Set': {
            const result: unknown[] = [];
            cache.set(index, result);
            for (const item of args) result.push(hydrate(item));
            return result;
          }
          case 'Map':
          case 'null': {
            const result: Record<string, unknown> = {};
            cache.set(index, result);
            for (let i = 0; i < args.length; i += 2)
              result[String(hydrate(args[i]))] = hydrate(args[i + 1]);
            return result;
          }
          default:
            throw new Error(`unknown devalue tag "${tag}"`);
        }
      }
      const result: unknown[] = [];
      cache.set(index, result);
      for (const item of value as unknown[]) result.push(hydrate(item));
      return result;
    }

    const result: Record<string, unknown> = {};
    cache.set(index, result);
    for (const [key, item] of Object.entries(value)) result[key] = hydrate(item);
    return result;
  };

  return hydrate(0);
}

const NUXT_DATA_SCRIPT = /<script[^>]*\bid="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

/** The decoded Nuxt payload of a page, or undefined if the page has none. */
export function extractNuxtData(html: string): unknown {
  const json = NUXT_DATA_SCRIPT.exec(html)?.[1];
  if (!json) return undefined;
  const flat: unknown = JSON.parse(json);
  if (!Array.isArray(flat)) throw new Error('__NUXT_DATA__ is not an array');
  return hydrateDevalue(flat);
}
