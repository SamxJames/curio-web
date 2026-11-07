import { dayKey } from "../day";
import { digLaunchDate, isDigOpen } from "./clock";
import { readDay } from "./server";
import type { DigLine } from "./digLineText";

/** Today's first prompt, for the digest and social posts. Server-side only:
 * imported by the cron routes and /sample-email, never by email or social
 * builders (they take the DigLine as a parameter). Reads `prompts[0].text`
 * only, never `payload`, so no answer or fossil data is touched. Returns null
 * and never throws when there is no dig to invite people to. */
export async function getDigLine(now: Date = new Date()): Promise<DigLine | null> {
  try {
    if (!digLaunchDate() || !isDigOpen(now)) return null;
    const day = await readDay(dayKey(now));
    const text = day?.prompts?.[0]?.text;
    return typeof text === "string" && text.trim() ? { prompt: text.trim() } : null;
  } catch {
    return null;
  }
}
