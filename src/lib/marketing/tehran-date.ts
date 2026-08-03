/**
 * Phase 10 / requirement 224 — Tehran calendar day, client side.
 *
 * The database is the authority: public.tehran_today() decides which day a
 * task belongs to and which ticks it will accept. This helper exists only so
 * the UI agrees with that decision, and it must stay a mirror — never a second
 * opinion.
 *
 * Deliberately built on the platform's own Intl time-zone database rather than
 * a date library or a hard-coded +03:30 offset:
 *   - no new dependency and nothing fetched from a CDN (rules 2/13);
 *   - `new Date().toISOString().slice(0,10)` would give the UTC day, which is
 *     wrong in Tehran every evening from 20:30 until midnight — exactly when
 *     marketing stories get posted;
 *   - a hard-coded offset would be a silent trap if Iran ever restores DST.
 *
 * 'en-CA' is used because it formats as YYYY-MM-DD, which is what Postgres
 * `date` columns and PostgREST filters expect.
 */

const TEHRAN_DAY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tehran",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's Gregorian date in Asia/Tehran, as `YYYY-MM-DD`. */
export function tehranToday(now: Date = new Date()): string {
  return TEHRAN_DAY_FORMATTER.format(now);
}
