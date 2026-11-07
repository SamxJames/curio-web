import { NextResponse } from "next/server";
import { DAY_MS, dayKey } from "@/lib/day";
import { dayNumber, digLaunchDate, isDigOpen, secondsToRollover } from "@/lib/dig/clock";
import { readDay } from "@/lib/dig/server";
import { tomorrowHint } from "@/lib/dig/tomorrow";

// Runs per request; the CDN caches the answer until 00:00 UTC via s-maxage.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Tomorrow's first prompt as a plain hint, or null. A missing day, a failed read or an odd prompt
 * never fails the request: the hint is a nicety on the end screen. Prompt text is public, and no
 * answer or fossil data is read. */
async function readTomorrow(now: Date): Promise<string | null> {
  try {
    const day = await readDay(dayKey(new Date(now.getTime() + DAY_MS)));
    const text = day?.prompts?.[0]?.text;
    return text ? tomorrowHint(text) : null;
  } catch (err) {
    console.error("dig: tomorrow read failed", err instanceof Error ? err.name : "unknown");
    return null;
  }
}

/** Today's day file (plus tomorrow's hint): browsers never compute "today", so a wrong device clock can't
 * open tomorrow. A missing day is a 503 the health cron will already have emailed about. */
export async function GET() {
  const now = new Date();
  const launch = digLaunchDate();
  if (!launch || !isDigOpen(now, launch)) {
    return NextResponse.json({ error: "Not open." }, { status: 404, headers: NO_STORE });
  }
  const date = dayKey(now);
  let day = null;
  try {
    day = await readDay(date);
  } catch (err) {
    console.error("dig: today read failed", err instanceof Error ? err.name : "unknown");
  }
  if (!day) return NextResponse.json({ error: "Today's dig isn't ready." }, { status: 503, headers: NO_STORE });
  return NextResponse.json(
    { ...day, number: dayNumber(date, launch), tomorrow: await readTomorrow(now) },
    { headers: { "Cache-Control": `public, max-age=0, s-maxage=${secondsToRollover(now)}` } }
  );
}
