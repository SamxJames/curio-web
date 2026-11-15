import { DAY_MS, dayKey } from "../day";
import { dayNumber, digLaunchDate, isDigOpen, isPastDay } from "./clock";
import { presentableFact } from "./fact";
import { decodeDay } from "./payload";
import { isRevealDay, type DigReveal } from "./revealText";
import { readDay } from "./server";

const tidy = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");

/** Yesterday's first prompt and its fossil, for the "yesterday's answer" post.
 * Server-side only: imported by the social cron, never by the text builders (they
 * take the DigReveal as a parameter). A past day only, so nothing here is a
 * spoiler: /dig/<date> already lists every answer. Reads the first prompt only,
 * and the fact only if `presentableFact` would show it on the dig screen.
 *
 * Returns null, and never throws, when there is nothing to post: the dig is
 * not open, yesterday was before launch or is not a built day, or yesterday
 * was an even dig number (the post runs on odd days). */
export async function getYesterdayReveal(now: Date = new Date()): Promise<DigReveal | null> {
  try {
    const launch = digLaunchDate();
    if (!launch || !isDigOpen(now, launch)) return null;
    const date = dayKey(new Date(now.getTime() - DAY_MS));
    if (!isPastDay(date, now, launch)) return null;
    const number = dayNumber(date, launch);
    if (!isRevealDay(number)) return null;

    const stored = await readDay(date);
    if (!stored) return null;
    const first = decodeDay(stored).prompts[0];
    const prompt = tidy(first?.text);
    const fossilWord = tidy(first?.fossil?.word);
    if (!prompt || !fossilWord) return null;
    return { date, number, prompt, fossilWord, fact: tidy(presentableFact(first.fossil)) };
  } catch {
    return null;
  }
}
