import { NextRequest, NextResponse } from "next/server";
import { isLikelyBot, parseTrafficEvent } from "@/lib/traffic";
import { recordTrafficEvent } from "@/lib/trafficStats";

/** First-party arrival and share counter (see lib/trafficStats.ts). Counts
 * only allowlisted field names; never stores who sent it. Analytics must
 * never surface an error to the page, so a recording failure still gets
 * 204. Bots get a silent 204 too: no point telling a crawler anything. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const ev = parseTrafficEvent(body);
  if (!ev) return NextResponse.json({ error: "Unknown event." }, { status: 400 });
  if (isLikelyBot(req.headers.get("user-agent"))) return new NextResponse(null, { status: 204 });
  try {
    await recordTrafficEvent(ev);
  } catch (err) {
    console.error("traffic: record failed", err instanceof Error ? err.name : "unknown");
  }
  return new NextResponse(null, { status: 204 });
}
