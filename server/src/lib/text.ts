/** "VSE ZA ZAJTRK" -> "Vse za zajtrk" */
export function toSentenceCase(text: string): string {
  const lower = text.trim().toLocaleLowerCase('sl');
  return lower.charAt(0).toLocaleUpperCase('sl') + lower.slice(1);
}

/** "DR. OETKER" -> "Dr. Oetker" */
export function toTitleCase(text: string): string {
  return text
    .trim()
    .toLocaleLowerCase('sl')
    .replace(
      /(^|[\s\-/.&(])(\p{L})/gu,
      (_, sep: string, letter: string) => sep + letter.toLocaleUpperCase('sl'),
    );
}

/** Parses "1,79" or "1.79" as a number; returns undefined for anything else. */
export function parseDecimal(text: string | number | null | undefined): number | undefined {
  if (typeof text === 'number') return Number.isFinite(text) ? text : undefined;
  if (!text) return undefined;
  const value = Number(text.trim().replace(',', '.'));
  return Number.isFinite(value) ? value : undefined;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
