export const STORE_TIME_ZONE = 'Europe/Ljubljana';

const offsetFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: STORE_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

/** Milliseconds Ljubljana is ahead of UTC at the given instant (+1 h in winter, +2 h in summer). */
function zoneOffsetMs(instant: number): number {
  const parts = Object.fromEntries(
    offsetFormatter.formatToParts(instant).map((p) => [p.type, Number(p.value)]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>;
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Converts a Ljubljana wall-clock time to the matching instant. */
export function fromStoreLocalTime(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  // Two passes settle the offset correctly around daylight-saving switches.
  const first = asUtc - zoneOffsetMs(asUtc);
  return new Date(asUtc - zoneOffsetMs(first));
}
