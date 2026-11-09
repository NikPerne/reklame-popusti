import { z } from 'zod';
import { STORE_IDS } from './stores.js';

/**
 * How the app shows a flyer:
 * - `pages`: our own viewer with the page images (Lidl publishes them through its flyer API);
 * - `embed`: the store's own flyer viewer in a frame (only hosts in EMBED_HOSTS, which allow it);
 * - `pdf`: the flyer PDF, opened in the browser's PDF viewer (Tuš);
 * - `link`: the store's flyer page, for stores that allow neither (Hofer).
 */
export const FLYER_VIEWERS = ['pages', 'embed', 'pdf', 'link'] as const;
export type FlyerViewer = (typeof FLYER_VIEWERS)[number];

/** Flyer viewers that may be framed; they send no X-Frame-Options or frame-ancestors. */
export const EMBED_HOSTS = ['letak.spar.si', 'katalogi.mercator.si', 'www.eurospin.si'] as const;
/** Where PDFs and page images may come from. */
const FILE_HOSTS = ['www.tus.si', 'imgproxy.leaflets.schwarz'];

const httpsUrl = z.url({ protocol: /^https$/ });
const onHosts = (hosts: readonly string[]) =>
  httpsUrl.refine((url) => hosts.includes(new URL(url).hostname), 'host not allowed');

/** Whether a PDF or page image may be read from this address (also checked before proxying). */
export function isFlyerFileUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && FILE_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

export const flyerPageSchema = z.object({
  image: onHosts(FILE_HOSTS),
  /** A larger version for zooming in. */
  zoom: onHosts(FILE_HOSTS).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export type FlyerPage = z.infer<typeof flyerPageSchema>;

export const flyerSchema = z
  .object({
    /** `<store>-<slug>`, used in the app's URL (/letak/:id). */
    id: z.string().regex(/^[a-z]+-[a-z0-9-]{1,120}$/),
    store: z.enum(STORE_IDS),
    title: z.string().trim().min(1).max(200),
    validFrom: z.date().optional(),
    validTo: z.date().optional(),
    coverUrl: httpsUrl.optional(),
    /** The flyer on the store's website. */
    sourceUrl: httpsUrl,
    viewer: z.enum(FLYER_VIEWERS),
    /** The frame (`embed`) or the file (`pdf`). */
    url: httpsUrl.optional(),
    pages: z.array(flyerPageSchema).max(400).optional(),
  })
  .refine((f) => f.viewer !== 'pages' || (f.pages?.length ?? 0) > 0, 'pages viewer needs pages')
  .refine(
    (f) =>
      f.viewer !== 'embed' ||
      (f.url !== undefined && EMBED_HOSTS.some((h) => h === new URL(f.url ?? '').hostname)),
    'embed viewer needs an allowed url',
  )
  .refine(
    (f) => f.viewer !== 'pdf' || (!!f.url && FILE_HOSTS.includes(new URL(f.url).hostname)),
    'pdf viewer needs an allowed url',
  );
export type Flyer = z.infer<typeof flyerSchema>;

/** Flyers that have not ended, soonest first (current before upcoming). */
export function currentFlyers<T extends Pick<Flyer, 'validFrom' | 'validTo'>>(
  flyers: readonly T[],
  now: Date,
): T[] {
  return flyers
    .filter((f) => !f.validTo || f.validTo >= now)
    .sort((a, b) => (a.validFrom?.getTime() ?? 0) - (b.validFrom?.getTime() ?? 0));
}
