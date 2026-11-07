/** The dig changes at 00:00 UTC (lib/day.ts). Players read that better on their own clock:
 * "A new dig opens at 7:00 pm your time." Client-only: the server can't know the reader's
 * timezone, so callers show ROLLOVER_FALLBACK until this runs in the browser. */
export function rolloverLine(now: Date = new Date(), opts: { timeZone?: string; locale?: string } = {}): string {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const clock24 = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: opts.timeZone }).format(next);
  // A player on UTC (or an hour-aligned zone that lands on 00:00): "midnight" beats "12:00 am".
  if (clock24 === "00:00") return "A new dig opens at midnight your time.";
  const time = new Intl.DateTimeFormat(opts.locale, { hour: "numeric", minute: "2-digit", timeZone: opts.timeZone })
    .formatToParts(next)
    .map((p) => (p.type === "dayPeriod" ? p.value.toLowerCase() : p.value))
    .join("")
    // ICU puts a narrow no-break space before am/pm; a plain no-break space keeps "7:00 pm" on one line in every font.
    .replace(/\s/g, " ");
  return `A new dig opens at ${time} your time.`;
}

/** Shown before the browser has worked out the local time (server render, first paint). */
export const ROLLOVER_FALLBACK = "A new dig opens at midnight UTC.";
