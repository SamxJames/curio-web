import { NextRequest, NextResponse } from "next/server";
import { dayKey } from "@/lib/day";
import { parseDigEvent } from "@/lib/dig/events";
import { recordClaim, recordFinish, recordFunnel } from "@/lib/dig/server";
import { isLikelyBot } from "@/lib/traffic";

/** The dig game's one write endpoint (architecture §8), with /api/traffic's safeguards:
 * JSON only, same-origin only, bots get a silent 204, nothing identifies the sender, and a
 * recording failure never surfaces to the page. Writes happen in production only (server.ts). */
export async function POST(req: NextRequest) {
  if (!req.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: "Unsupported content type." }, { status: 415 });
  }
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const today = dayKey();
  const ev = parseDigEvent(body, today);
  if (!ev) return NextResponse.json({ error: "Unknown event." }, { status: 400 });
  if (isLikelyBot(req.headers.get("user-agent"))) return new NextResponse(null, { status: 204 });
  try {
    if (ev.kind === "finish") return NextResponse.json({ spread: await recordFinish(ev) });
    if (ev.kind === "claim") await recordClaim(ev);
    else await recordFunnel(today, ev);
  } catch (err) {
    console.error("dig: event failed", err instanceof Error ? err.name : "unknown");
  }
  return new NextResponse(null, { status: 204 });
}
