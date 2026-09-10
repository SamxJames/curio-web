import { NextRequest, NextResponse } from "next/server";
import { upsertSubscriber } from "@/lib/db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { email, hour } = (body ?? {}) as { email?: string; hour?: number };

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (typeof hour !== "number" || hour < 0 || hour > 23 || !Number.isInteger(hour)) {
    return NextResponse.json({ error: "Pick a delivery hour between 0 and 23." }, { status: 400 });
  }

  await upsertSubscriber(email, hour);
  return NextResponse.json({ ok: true });
}
