import { NextResponse } from "next/server";
import { dayKey } from "@/lib/day";
import { dayNumber, digLaunchDate, isDigOpen, secondsToRollover } from "@/lib/dig/clock";
import { readDay } from "@/lib/dig/server";

// Runs per request; the CDN caches the answer until 00:00 UTC via s-maxage.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Today's day file only: browsers never compute "today", so a wrong device clock can't
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
    { ...day, number: dayNumber(date, launch) },
    { headers: { "Cache-Control": `public, max-age=0, s-maxage=${secondsToRollover(now)}` } }
  );
}
