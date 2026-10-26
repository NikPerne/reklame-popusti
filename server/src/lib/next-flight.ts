/**
 * Reader for the React Server Components "flight" payload that Next.js App Router pages stream
 * into their HTML as `self.__next_f.push([1, "..."])` chunks (e.g. Spar's online shop).
 *
 * The joined chunks form rows `<hex id>:<value>\n`. A value is JSON, or `T<hex byte length>,<text>`
 * for long strings. Inside values, strings like "$1f" refer to row 1f.
 */

const PUSH = /self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g;

/** The joined flight text of a page. */
export function flightText(html: string): string {
  let text = '';
  for (const match of html.matchAll(PUSH)) {
    const chunk: unknown = JSON.parse(match[1] ?? '[]');
    if (Array.isArray(chunk) && chunk[0] === 1 && typeof chunk[1] === 'string') text += chunk[1];
  }
  return text;
}

/** Splits flight text into rows by id. Rows that aren't JSON are kept as strings. */
export function flightRows(text: string): Map<string, unknown> {
  const rows = new Map<string, unknown>();
  const bytes = Buffer.from(text, 'utf8');
  let position = 0;

  while (position < bytes.length) {
    const colon = bytes.indexOf(0x3a, position); // ':'
    if (colon < 0) break;
    const id = bytes.subarray(position, colon).toString();
    const start = colon + 1;

    if (bytes[start] === 0x54 /* 'T' */) {
      const comma = bytes.indexOf(0x2c, start);
      const length = Number.parseInt(bytes.subarray(start + 1, comma).toString(), 16);
      rows.set(id, bytes.subarray(comma + 1, comma + 1 + length).toString());
      position = comma + 1 + length;
      continue;
    }

    const newline = bytes.indexOf(0x0a, start);
    const end = newline < 0 ? bytes.length : newline;
    const raw = bytes.subarray(start, end).toString();
    try {
      rows.set(id, JSON.parse(raw) as unknown);
    } catch {
      rows.set(id, raw); // component references, hints, ...
    }
    position = end + 1;
  }
  return rows;
}

/** Returns a function that replaces "$<id>" references with the referenced rows, recursively. */
export function flightResolver(rows: Map<string, unknown>): (value: unknown) => unknown {
  const cache = new Map<string, unknown>();
  const resolving = new Set<string>();

  const resolve = (value: unknown): unknown => {
    if (typeof value === 'string') {
      const ref = /^\$([0-9a-f]+)$/.exec(value)?.[1];
      if (!ref || !rows.has(ref)) return value;
      if (cache.has(ref)) return cache.get(ref);
      if (resolving.has(ref)) return undefined; // cycle
      resolving.add(ref);
      const resolved = resolve(rows.get(ref));
      resolving.delete(ref);
      cache.set(ref, resolved);
      return resolved;
    }
    if (Array.isArray(value)) return value.map(resolve);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v)]));
    }
    return value;
  };
  return resolve;
}

/** All rows that are objects with the given `__typename`, with references resolved. */
export function flightObjects(html: string, typename: string): unknown[] {
  const rows = flightRows(flightText(html));
  const resolve = flightResolver(rows);
  const objects: unknown[] = [];
  for (const value of rows.values()) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      (value as { __typename?: unknown }).__typename === typename
    ) {
      objects.push(resolve(value));
    }
  }
  return objects;
}
