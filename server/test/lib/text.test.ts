import { describe, expect, it } from 'vitest';
import { parseDecimal, toSentenceCase, toTitleCase } from '../../src/lib/text.js';

describe('text helpers', () => {
  it('converts to sentence case with Slovenian letters', () => {
    expect(toSentenceCase('ČOKOLADA IN DRUGI SLADKI PROGRAM')).toBe(
      'Čokolada in drugi sladki program',
    );
  });

  it('converts brand names to title case', () => {
    expect(toTitleCase('DR. OETKER')).toBe('Dr. Oetker');
    expect(toTitleCase('ŽITO')).toBe('Žito');
    expect(toTitleCase('COCA-COLA')).toBe('Coca-Cola');
  });

  it('parses decimals with comma or dot', () => {
    expect(parseDecimal('1,79')).toBe(1.79);
    expect(parseDecimal('4.79')).toBe(4.79);
    expect(parseDecimal(2)).toBe(2);
    expect(parseDecimal('')).toBeUndefined();
    expect(parseDecimal('abc')).toBeUndefined();
  });
});
