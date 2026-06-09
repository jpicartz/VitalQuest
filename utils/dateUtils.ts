/** Local calendar date as YYYY-MM-DD (avoids UTC shifts from toISOString()). */
export const toISODateString = (date: Date = new Date()): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Parse YYYY-MM-DD as local midnight (reliable, no locale string parsing). */
export const parseISODate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDaysISO = (iso: string, days: number): string => {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODateString(d);
};

/** Timestamp for start of local calendar day (for meal log grouping). */
export const timestampForISODate = (iso: string): number =>
  parseISODate(iso).getTime();

/** Map a log timestamp to its local YYYY-MM-DD. */
export const timestampToISODate = (timestamp: number): string =>
  toISODateString(new Date(timestamp));

export const isSameISODate = (timestamp: number, iso: string): boolean =>
  timestampToISODate(timestamp) === iso;

/** Labels for the date navigator (Today / Yesterday / formatted date). */
export const formatNavigatorLabel = (
  iso: string
): { title: string; subtitle: string } => {
  const today = toISODateString();
  const yesterday = addDaysISO(today, -1);
  const d = parseISODate(iso);
  const subtitle = d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  if (iso === today) return { title: 'Today', subtitle };
  if (iso === yesterday) return { title: 'Yesterday', subtitle };
  return {
    title: d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }),
    subtitle,
  };
};
