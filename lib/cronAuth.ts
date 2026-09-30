import { NextRequest, NextResponse } from "next/server";

/** Every cron route's gate. Production without CRON_SECRET fails closed:
 * an open cron would email every subscriber and post publicly. `secret` is
 * returned so routes can require it for their manual overrides. */
export function authorizeCron(req: NextRequest): { secret: string | undefined; denied: NextResponse | null } {
  const secret = process.env.CRON_SECRET || undefined;
  if (!secret && process.env.NODE_ENV === "production") {
    return { secret, denied: NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 401 }) };
  }
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return { secret, denied: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { secret, denied: null };
}
