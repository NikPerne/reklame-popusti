import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { flyerSchema } from '../../src/domain/flyer.js';
import {
  EUROSPIN_FLYER,
  HOFER_FLYER,
  extractLidlFlyerIds,
  lidlFlyerApiUrl,
  parseLidlFlyer,
  parseMercatorFlyers,
  parseSparFlyers,
  parseTusFlyers,
  sparWeeklyFlyers,
} from '../../src/flyers/parse-flyers.js';

/** Excerpts of the stores' flyer pages and Lidl's leaflet API (2026-11-09). */
const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/flyers/${name}`, import.meta.url), 'utf8');

const valid = (flyers: unknown[]) => flyers.every((f) => flyerSchema.safeParse(f).success);

describe('Lidl flyers', () => {
  it('finds the flyers linked from the "Spletni katalog" page', () => {
    expect(extractLidlFlyerIds(fixture('lidl-spletni-katalog.html'))).toEqual([
      'lidlov-bozicni-katalog-2026',
      'lidlov-katalog-2026-kw45',
      'lidlov-katalog-2026-kw46',
      'lidlov-katalog-igrac-2026',
    ]);
    expect(lidlFlyerApiUrl('lidlov-katalog-2026-kw45')).toBe(
      'https://endpoints.leaflets.schwarz/v4/flyer?flyer_identifier=lidlov-katalog-2026-kw45&region_id=0',
    );
  });

  it('reads the pages and the offer dates from the leaflet API', () => {
    const flyer = parseLidlFlyer(
      'lidlov-katalog-2026-kw45',
      JSON.parse(fixture('lidl-flyer.json')),
    )!;

    expect(flyer).toMatchObject({
      id: 'lidl-lidlov-katalog-2026-kw45',
      store: 'lidl',
      title: 'Lidlov katalog od 5. 11.',
      validFrom: new Date('2026-11-04T23:00:00Z'),
      validTo: new Date('2026-11-11T22:59:59Z'),
      viewer: 'pages',
      sourceUrl: 'https://www.lidl.si/l/sl/katalog/lidlov-katalog-2026-kw45/ar/0?lf=HHZ',
    });
    expect(flyer.pages).toHaveLength(3);
    expect(flyer.pages![0]).toMatchObject({
      image: expect.stringMatching(/^https:\/\/imgproxy\.leaflets\.schwarz\//) as unknown,
      zoom: expect.stringMatching(/^https:\/\/imgproxy\.leaflets\.schwarz\//) as unknown,
      width: 1416,
      height: 2400,
    });
    expect(valid([flyer])).toBe(true);
  });

  it('skips expired flyers', () => {
    const json = JSON.parse(fixture('lidl-flyer.json')) as { flyer: { status: string } };
    json.flyer.status = 'expired';
    expect(parseLidlFlyer('x', json)).toBeUndefined();
  });
});

describe('Spar flyers', () => {
  it('reads the catalogues from the structured data and opens them in the iPaper viewer', () => {
    const flyers = parseSparFlyers(fixture('spar-letak.html'));

    expect(flyers).toHaveLength(12);
    expect(flyers.find((f) => f.id === 'spar-katalog-4626')).toEqual({
      id: 'spar-katalog-4626',
      store: 'spar',
      title: 'Katalog 46/26',
      validFrom: new Date('2026-11-07T23:00:00Z'),
      validTo: new Date('2026-11-24T22:59:59Z'),
      coverUrl: 'https://letak.spar.si/katalog-4626/Image.ashx?PageNumber=1&ImageType=Normal',
      sourceUrl: 'https://www.spar.si/letak/katalog-4626',
      viewer: 'embed',
      url: 'https://letak.spar.si/katalog-4626/',
    });
    expect(valid(flyers)).toBe(true);
  });

  it('works out the weekly catalogues when the list cannot be read', () => {
    // Monday 9 November 2026: catalogue 46/26 started on Sunday, 45/26 the Sunday before.
    const flyers = sparWeeklyFlyers(new Date('2026-11-09T10:00:00Z'));

    expect(flyers.map((f) => [f.title, f.url, f.validFrom])).toEqual([
      ['Katalog 46/26', 'https://letak.spar.si/katalog-4626/', new Date('2026-11-07T23:00:00Z')],
      ['Katalog 45/26', 'https://letak.spar.si/katalog-4526/', new Date('2026-10-31T23:00:00Z')],
    ]);
    // On Sunday the new week's catalogue starts.
    expect(sparWeeklyFlyers(new Date('2026-11-15T08:00:00Z'))[0]?.title).toBe('Katalog 47/26');
    // Across the new year: ISO week 1 of 2027 starts on Monday 4 January.
    expect(sparWeeklyFlyers(new Date('2027-01-03T08:00:00Z'))[0]).toMatchObject({
      title: 'Katalog 01/27',
      validFrom: new Date('2027-01-02T23:00:00Z'),
    });
    expect(valid(flyers)).toBe(true);
  });
});

describe('Mercator flyers', () => {
  it('reads the catalogue list and opens each in its iPaper viewer', () => {
    const flyers = parseMercatorFlyers(fixture('mercator-katalogi.html'));

    expect(flyers.map((f) => f.title)).toEqual([
      'Redni katalog od 12. 11. do 18. 11. 2026',
      'Redni katalog od 5. 11. do 11. 11. 2026',
      'Katalog Radi imamo domače: Domače je preprosto dobro',
    ]);
    expect(flyers[1]).toMatchObject({
      id: 'mercator-redni-katalog-od-5-11-do-11-11-2026',
      validFrom: new Date('2026-11-04T23:00:00Z'),
      validTo: new Date('2026-11-11T22:59:59Z'),
      viewer: 'embed',
      url: 'https://katalogi.mercator.si/mercator/mercator-si/redni-katalog/redni-katalog-od-5-11-do-11-11-2026/',
      sourceUrl: 'https://www.mercator.si/katalogi/redni-katalog-od-5-11-do-11-11-2026/',
    });
    expect(flyers[2]?.validTo).toBeUndefined();
    expect(valid(flyers)).toBe(true);
  });
});

describe('Tuš flyers', () => {
  it('reads the catalogue cards as PDFs and leaves out "Mojih 10"', () => {
    const flyers = parseTusFlyers(fixture('tus-katalogi.html'));

    expect(flyers.length).toBeGreaterThan(0);
    expect(flyers.some((f) => /mojih/i.test(f.url ?? ''))).toBe(false);
    expect(flyers.find((f) => f.id === 'tus-569')).toEqual({
      id: 'tus-569',
      store: 'tus',
      title: 'Akcijski katalog',
      validFrom: new Date('2026-11-03T23:00:00Z'),
      validTo: new Date('2026-11-10T22:59:59Z'),
      coverUrl: 'https://api.tus.si/files/thumbnails/20261029064856_44_akcija_4.jpg',
      sourceUrl: 'https://www.tus.si/katalogi/?uid=569',
      viewer: 'pdf',
      url: 'https://www.tus.si/app/uploads/catalogues/20261029064856_44_akcija_4.11.-10.11.2026_A44_26.pdf',
    });
    expect(valid(flyers)).toBe(true);
  });
});

describe('flyer validation', () => {
  it('accepts the fixed Hofer and Eurospin entries', () => {
    expect(valid([HOFER_FLYER, EUROSPIN_FLYER])).toBe(true);
  });

  it('only frames the stores’ own viewers and only takes PDFs from Tuš', () => {
    const embed = { ...EUROSPIN_FLYER, url: 'https://evil.example/letak/' };
    const pdf = { ...EUROSPIN_FLYER, viewer: 'pdf', url: 'https://evil.example/a.pdf' };
    const pages = { ...EUROSPIN_FLYER, viewer: 'pages', pages: [] };

    expect(flyerSchema.safeParse(embed).success).toBe(false);
    expect(flyerSchema.safeParse(pdf).success).toBe(false);
    expect(flyerSchema.safeParse(pages).success).toBe(false);
    expect(
      flyerSchema.safeParse({ ...EUROSPIN_FLYER, url: 'http://www.eurospin.si/' }).success,
    ).toBe(false);
  });
});
