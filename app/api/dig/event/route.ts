import { NextRequest, NextResponse } from "next/server";
import { dayKey } from "@/lib/day";
import { digLaunchDate, isDigOpen } from "@/lib/dig/clock";
import { parseDigEvent } from "@/lib/dig/events";
import { recordClaim, recordFinish, recordFunnel } from "@/lib/dig/server";
import { isLikelyBot } from "@/lib/traffic";

/** Largest body a dig event can legitimately need (a finish with 21 rejected guesses is well under this). */
const MAX_BODY_BYTES = 4096;

const NO_STORE = { "Cache-Control": "no-store" };

/** The dig game's one write endpoint (architecture §8), with /api/traffic's safeguards:
 * JSON only, same-origin only, bots get a silent 204 before their body is read, a body cap,
 * nothing identifies the sender, and a recording failure never surfaces to the page.
 * Closed (404) until launch, like the pages. Writes happen in production only (server.ts). */
export async function POST(req: NextRequest) {
  const launch = digLaunchDate();
  if (!launch || !isDigOpen(new Date(), launch)) {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE });
  }
  if (!req.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: "Unsupported content type." }, { status: 415 });
  }
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (isLikelyBot(req.headers.get("user-agent"))) return new NextResponse(null, { status: 204 });
  if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request body too large." }, { status: 413 });
  }
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request body too large." }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const today = dayKey();
  const ev = parseDigEvent(body, today);
  if (!ev) return NextResponse.json({ error: "Unknown event." }, { status: 400 });
  try {
    if (ev.kind === "finish") return NextResponse.json({ spread: await recordFinish(ev) });
    if (ev.kind === "claim") await recordClaim(ev);
    else await recordFunnel(today, ev);
  } catch (err) {
    console.error("dig: event failed", err instanceof Error ? err.name : "unknown");
  }
  return new NextResponse(null, { status: 204 });
}
