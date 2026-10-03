import { NextRequest, NextResponse } from "next/server";
import { upsertSubscriber } from "@/lib/db";
import { isTrafficSource } from "@/lib/traffic";
import { recordTrafficEvent } from "@/lib/trafficStats";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { email, source } = (body ?? {}) as { email?: string; source?: unknown };

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  await upsertSubscriber(email);
  // Which arrival this signup came from (lib/trafficClient.ts). Counting
  // must never fail a real subscribe; an unknown source files as "direct".
  try {
    await recordTrafficEvent({ kind: "signup", source: isTrafficSource(source) ? source : "direct" });
  } catch (err) {
    console.error("traffic: signup record failed", err instanceof Error ? err.name : "unknown");
  }
  return NextResponse.json({ ok: true });
}
