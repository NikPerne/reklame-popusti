import { z } from 'zod';
import type { Flyer } from '../domain/flyer.js';
import { decodeHtmlEntities } from '../lib/html.js';
import { toSentenceCase } from '../lib/text.js';
import { fromStoreLocalTime } from '../lib/time.js';

/** A day in the stores' time zone: its first second, or its last for an end date. */
function storeDay(iso: string | undefined, end = false): Date | undefined {
  const match = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!match) return undefined;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return end ? fromStoreLocalTime(y, m, d, 23, 59, 59) : fromStoreLocalTime(y, m, d);
}

const stripTags = (html: string) =>
  decodeHtmlEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

// --- Lidl -------------------------------------------------------------------------------

export const LIDL_FLYERS_URL = 'https://www.lidl.si/c/spletni-katalog/s10019133';
export const lidlFlyerApiUrl = (identifier: string) =>
  `https://endpoints.leaflets.schwarz/v4/flyer?flyer_identifier=${encodeURIComponent(identifier)}&region_id=0`;

/** Flyer identifiers linked from Lidl's "Spletni katalog" page, e.g. "lidlov-katalog-2026-kw45". */
export function extractLidlFlyerIds(html: string): string[] {
  const ids = [...html.matchAll(/\/l\/sl\/katalog\/([a-z0-9-]+)/g)].flatMap((m) => m[1] ?? []);
  return [...new Set(ids)];
}

const lidlFlyerSchema = z.object({
  flyer: z.object({
    name: z.string(),
    title: z.string().optional(),
    status: z.string().optional(),
    thumbnailUrl: z.string().optional(),
    flyerUrlAbsolute: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    offerStartDate: z.string().optional(),
    offerEndDate: z.string().optional(),
    pages: z.array(
      z.object({
        image: z.string(),
        zoom: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
      }),
    ),
  }),
});

/** One flyer from Lidl's leaflet API (endpoints.leaflets.schwarz), shown page by page. */
export function parseLidlFlyer(identifier: string, json: unknown): Flyer | undefined {
  const { flyer } = lidlFlyerSchema.parse(json);
  if (flyer.status === 'expired') return undefined;
  const validFrom = storeDay(flyer.offerStartDate ?? flyer.startDate);
  const validTo = storeDay(flyer.offerEndDate ?? flyer.endDate, true);
  return {
    id: `lidl-${identifier}`,
    store: 'lidl',
    title: [flyer.name, flyer.title].filter(Boolean).join(' '),
    ...(validFrom && { validFrom }),
    ...(validTo && { validTo }),
    ...(flyer.thumbnailUrl && { coverUrl: flyer.thumbnailUrl }),
    sourceUrl: flyer.flyerUrlAbsolute ?? `https://www.lidl.si/l/sl/katalog/${identifier}`,
    viewer: 'pages',
    pages: flyer.pages.map((p) => ({
      image: p.image,
      ...(p.zoom && { zoom: p.zoom }),
      ...(p.width && { width: p.width }),
      ...(p.height && { height: p.height }),
    })),
  };
}

// --- Spar -------------------------------------------------------------------------------

export const SPAR_FLYERS_URL = 'https://www.spar.si/letak';

const sparCatalogSchema = z.object({
  '@type': z.literal('OfferCatalog'),
  itemListElement: z.array(
    z.object({
      name: z.string(),
      url: z.string(),
      image: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }),
  ),
});

/**
 * Flyers from the structured data (schema.org OfferCatalog) of www.spar.si/letak. Each opens
 * in Spar's iPaper viewer at letak.spar.si, which may be framed.
 */
export function parseSparFlyers(html: string): Flyer[] {
  for (const match of html.matchAll(
    /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g,
  )) {
    const parsed = sparCatalogSchema.safeParse(JSON.parse(match[1] ?? 'null'));
    if (!parsed.success) continue;
    return parsed.data.itemListElement.flatMap((item) => {
      const slug = /\/letak\/([a-z0-9-]+)\/?$/.exec(item.url)?.[1];
      if (!slug) return [];
      const validFrom = storeDay(item.startDate);
      const validTo = storeDay(item.endDate, true);
      return [
        {
          id: `spar-${slug}`,
          store: 'spar' as const,
          // "Katalog 46/26 08.11.2026 - 24.11.2026": the dates are shown separately.
          title: item.name.replace(/\s+\d{2}\.\d{2}\.\d{4}\s*-\s*\d{2}\.\d{2}\.\d{4}\s*$/, ''),
          ...(validFrom && { validFrom }),
          ...(validTo && { validTo }),
          ...(item.image && { coverUrl: item.image }),
          sourceUrl: item.url,
          viewer: 'embed' as const,
          url: `https://letak.spar.si/${slug}/`,
        },
      ];
    });
  }
  return [];
}

/** ISO 8601 week number and its year (the year of the week's Thursday). */
function isoWeek(date: Date): { week: number; year: number } {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  return {
    week: Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7),
    year: day.getUTCFullYear(),
  };
}

/**
 * Spar's weekly catalogues, worked out from the date, for when www.spar.si/letak can't be read
 * (its Cloudflare rejects the refresh's HTTP client). Catalogue "46/26" starts on the Sunday
 * before ISO week 46 of 2026 and is at letak.spar.si/katalog-4626/; each runs about two and a
 * half weeks, so this one and the one before are both current.
 */
export function sparWeeklyFlyers(now: Date): Flyer[] {
  return [0, 7].map((daysBack) => {
    // The Sunday a catalogue starts belongs to the next ISO week.
    const { week, year } = isoWeek(new Date(now.getTime() + (1 - daysBack) * 86_400_000));
    const ww = String(week).padStart(2, '0');
    const yy = String(year % 100).padStart(2, '0');
    const slug = `katalog-${ww}${yy}`;
    // Monday of that ISO week, minus a day.
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * 86_400_000);
    const sunday = new Date(monday.getTime() + ((week - 1) * 7 - 1) * 86_400_000);
    return {
      id: `spar-${slug}`,
      store: 'spar' as const,
      title: `Katalog ${ww}/${yy}`,
      validFrom: fromStoreLocalTime(
        sunday.getUTCFullYear(),
        sunday.getUTCMonth() + 1,
        sunday.getUTCDate(),
      ),
      coverUrl: `https://letak.spar.si/${slug}/Image.ashx?PageNumber=1&ImageType=Normal`,
      sourceUrl: `https://www.spar.si/letak/${slug}`,
      viewer: 'embed' as const,
      url: `https://letak.spar.si/${slug}/`,
    };
  });
}

// --- Mercator ---------------------------------------------------------------------------

export const MERCATOR_FLYERS_URL = 'https://www.mercator.si/katalogi/';

/** "… od 5. 11. do 11. 11. 2026" (the start's year may be left out). */
function mercatorDates(title: string): { validFrom?: Date; validTo?: Date } {
  const m = /od (\d{1,2})\. ?(\d{1,2})\.(?: ?(\d{4}))? do (\d{1,2})\. ?(\d{1,2})\. ?(\d{4})/.exec(
    title,
  );
  if (!m) return {};
  const endYear = Number(m[6]);
  const startMonth = Number(m[2]);
  // A flyer from 29. 12. to 4. 1. 2027 starts in the year before.
  const startYear = m[3] ? Number(m[3]) : startMonth > Number(m[5]) ? endYear - 1 : endYear;
  return {
    validFrom: fromStoreLocalTime(startYear, startMonth, Number(m[1])),
    validTo: fromStoreLocalTime(endYear, Number(m[5]), Number(m[4]), 23, 59, 59),
  };
}

/**
 * Flyers on www.mercator.si/katalogi/. The cover image comes from the flyer's iPaper viewer
 * (viewer.ipaper.io/mercator/…), which redirects to katalogi.mercator.si and may be framed.
 */
export function parseMercatorFlyers(html: string): Flyer[] {
  const items = html.split('<li class="catalog-item">').slice(1);
  return items.flatMap((item) => {
    const slug = /href="\/katalogi\/([a-z0-9-]+)\/"/.exec(item)?.[1];
    const cover = /<img src="([^"]+)"/.exec(item)?.[1];
    const viewer =
      cover &&
      /^https:\/\/viewer\.ipaper\.io\/(mercator\/[a-z0-9/-]+?\/)Image\.ashx/.exec(
        decodeHtmlEntities(cover),
      )?.[1];
    const title = /<h4>([\s\S]*?)<\/h4>/.exec(item)?.[1];
    if (!slug || !viewer || !title) return [];
    const name = stripTags(title);
    return [
      {
        id: `mercator-${slug}`,
        store: 'mercator' as const,
        title: name,
        ...mercatorDates(name),
        coverUrl: decodeHtmlEntities(cover),
        sourceUrl: `https://www.mercator.si/katalogi/${slug}/`,
        viewer: 'embed' as const,
        url: `https://katalogi.mercator.si/${viewer}`,
      },
    ];
  });
}

// --- Tuš --------------------------------------------------------------------------------

export const TUS_FLYERS_URL = 'https://www.tus.si/aktualno/katalogi-in-revije/';

/**
 * Catalogue cards on Tuš's "Katalogi in revije" page. Tuš only publishes PDFs (its viewer
 * renders them in the page), so they open in the browser's PDF viewer. "Mojih 10" is left
 * out, like its offers.
 */
export function parseTusFlyers(html: string): Flyer[] {
  const cards = html.split('class="card card-catalogue"').slice(1);
  return cards.flatMap((card) => {
    const pdf = /href="(https:\/\/www\.tus\.si\/app\/uploads\/catalogues\/[^"]+\.pdf)"/.exec(
      card,
    )?.[1];
    const link =
      /<h3>\s*<a href="(https:\/\/www\.tus\.si\/katalogi\/\?uid=(\d+))">([\s\S]*?)<\/a>/.exec(card);
    const [, sourceUrl, uid, name] = link ?? [];
    if (!pdf || !sourceUrl || !uid || !name || /mojih[_ -]?10/i.test(pdf)) return [];
    const [start, end] = [...card.matchAll(/<time datetime="([\d-]+)"/g)].map((m) => m[1]);
    const cover = /data-src="(https:\/\/api\.tus\.si\/[^"]+)"/.exec(card)?.[1];
    const validFrom = storeDay(start);
    const validTo = storeDay(end, true);
    return [
      {
        id: `tus-${uid}`,
        store: 'tus' as const,
        title: toSentenceCase(stripTags(name)),
        ...(validFrom && { validFrom }),
        ...(validTo && { validTo }),
        ...(cover && { coverUrl: cover }),
        sourceUrl: decodeHtmlEntities(sourceUrl),
        viewer: 'pdf' as const,
        url: pdf,
      },
    ];
  });
}

// --- Stores whose flyers can't be read ---------------------------------------------------

/** Eurospin's flyer depends on the shop picked on the page itself, which may be framed. */
export const EUROSPIN_FLYER: Flyer = {
  id: 'eurospin-letak',
  store: 'eurospin',
  title: 'Letak',
  sourceUrl: 'https://www.eurospin.si/letak/',
  viewer: 'embed',
  url: 'https://www.eurospin.si/letak/',
};

/** letaki.hofer.si blocks this app and hofer.si forbids framing: only a link. */
export const HOFER_FLYER: Flyer = {
  id: 'hofer-letaki',
  store: 'hofer',
  title: 'Letaki in brošure',
  sourceUrl: 'https://www.hofer.si/aktualni-letaki-in-brosure',
  viewer: 'link',
  url: 'https://www.hofer.si/aktualni-letaki-in-brosure',
};
