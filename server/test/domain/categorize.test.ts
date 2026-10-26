import { describe, expect, it } from 'vitest';
import { guessCategory } from '../../src/domain/categorize.js';

describe('guessCategory', () => {
  it.each([
    ['Šunka, 200 g', 'meso-ribe'],
    ['Temno pivo, 4 x 0,5 l', 'pijace'],
    ['Sirup, 1 l', 'pijace'],
    ['Sir "Feta", 400 g', 'mlecni-izdelki'],
    ['Keksi (Čokoladni piškoti z mlekom)', 'sladko-slano'],
    ['Štručka s česnovim maslom', 'kruh-pekovsko'],
    ['Tuna v sončničnem olju', 'meso-ribe'],
    ['Klobasice za pse', 'zivali'],
    ['Rumena paprika koničasta', 'sadje-zelenjava'],
    ['Chianti, 0,75 l', 'pijace'],
    ['Lešnikovi cmoki', 'shramba'],
    ['Mleta kava Classic', 'shramba'],
    ['Obešanka za WC školjko', 'gospodinjstvo'],
    ['Linija za napredno nego obraza', 'drogerija'],
  ])('%s -> %s', (name, expected) => {
    expect(guessCategory(name, 'any', 'drugo')).toBe(expected);
  });

  it('respects the food / non-food split and the fallback', () => {
    expect(guessCategory('Komplet pripomočkov za avto', 'nonfood', 'drugo')).toBe('dom-vrt');
    expect(guessCategory('Masažna kad za noge', 'nonfood', 'drugo')).toBe('drugo');
    expect(guessCategory('Nekaj čisto novega', 'food', 'shramba')).toBe('shramba');
    // A non-food rule can't win for a product the store calls food.
    expect(guessCategory('Okrasna torta', 'food', 'shramba')).toBe('sladko-slano');
  });
});
