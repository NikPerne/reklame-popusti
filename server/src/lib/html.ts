const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
};

/** Decodes the HTML entities found in attribute values (&quot;, &#39;, &#x27;, ...). */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith('#')) return String.fromCodePoint(Number(entity.slice(1)));
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Values of every `name="..."` attribute in the HTML, decoded. */
export function attributeValues(html: string, name: string): string[] {
  const pattern = new RegExp(`\\s${name}="([^"]*)"`, 'g');
  return [...html.matchAll(pattern)].map((m) => decodeHtmlEntities(m[1] ?? ''));
}
