import { describe, expect, it } from 'vitest';
import { editDistance, searchWords, SpellChecker } from '../../src/domain/spelling.js';

const checker = new SpellChecker(
  new Map([
    ['maslo', 120],
    ['masso', 2],
    ['antico', 2],
    ['mleko', 300],
    ['jogurt', 250],
    ['jogurti', 40],
    ['cokolada', 180],
    ['primitivo', 3],
    ['250', 400],
  ]),
);

describe('editDistance', () => {
  it('counts a swap of neighbouring letters as one edit', () => {
    expect(editDistance('malso', 'maslo', 2)).toBe(1);
    expect(editDistance('malso', 'masso', 2)).toBe(1);
    expect(editDistance('mleko', 'mleko', 2)).toBe(0);
    expect(editDistance('cokolada', 'cklada', 2)).toBe(2);
  });

  it('stops early past the limit', () => {
    expect(editDistance('maslo', 'cokolada', 1)).toBe(2);
    expect(editDistance('jogurt', 'maslo', 1)).toBe(2);
  });
});

describe('searchWords', () => {
  it('splits on anything but letters and digits, without diacritics', () => {
    expect(searchWords('Čokolada,  MLEČNA 1,5%')).toEqual(['cokolada', 'mlecna', '1', '5']);
  });
});

describe('SpellChecker', () => {
  it('corrects a typo to the most common close word, not the rarest', () => {
    // One letter from both "maslo" (120 products) and "masso" (a wine's name, 2).
    expect(checker.correct('malso')).toBe('maslo');
    expect(checker.correct('Mleo')).toBe('mleko');
    expect(checker.correct('jgourt')).toBe('jogurt');
  });

  it('allows two edits in long words', () => {
    expect(checker.correct('cokoalda')).toBe('cokolada');
    expect(checker.correct('ckolada')).toBe('cokolada');
  });

  it('keeps known words, words being typed, short words and numbers', () => {
    expect(checker.correct('masso antico')).toBeUndefined();
    expect(checker.correct('jogu')).toBeUndefined();
    expect(checker.correct('sir')).toBeUndefined();
    expect(checker.correct('maslo 251')).toBeUndefined();
  });

  it('corrects only the misspelled words and keeps unknown ones as typed', () => {
    expect(checker.correct('Malso xyzzy 250')).toBe('maslo xyzzy 250');
    expect(checker.correct('xyzzy')).toBeUndefined();
  });
});
