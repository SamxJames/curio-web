import { NextRequest, NextResponse } from "next/server";
import { dayNumber, digLaunchDate, isDateKey, isPastDay } from "@/lib/dig/clock";
import { readDay } from "@/lib/dig/server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const notFound = () => NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE });

/** Past days only. A day so cached, not immutable: weekly adjudication can add
 * accepted-only answers to past days. Today and future dates are 404 and never cached. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/dig/day/[date]">) {
  const { date } = await ctx.params;
  if (!isDateKey(date)) return notFound();
  const launch = digLaunchDate();
  if (!launch || !isPastDay(date, new Date(), launch)) return notFound();
  let day = null;
  try {
    day = await readDay(date);
  } catch (err) {
    console.error("dig: day read failed", err instanceof Error ? err.name : "unknown");
  }
  if (!day) return notFound();
  return NextResponse.json(
    { ...day, number: dayNumber(date, launch) },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800" } }
  );
}
