import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSubscriberByEmail, upsertSubscriber } from "@/lib/db";
import { isSignupPlacement, isTrafficSource } from "@/lib/traffic";
import { recordTrafficEvent } from "@/lib/trafficStats";
import { normaliseEmail } from "@/lib/unsubscribeToken";

const NO_STORE = { "Cache-Control": "no-store" };
const SIGNED_OUT = () => NextResponse.json({ error: "Sign in first." }, { status: 401, headers: NO_STORE });
const FAILED = () =>
  NextResponse.json({ error: "Something went wrong on our side. Please try again in a few minutes." }, { status: 500, headers: NO_STORE });

async function sessionEmail(): Promise<string | null> {
  const email = (await auth())?.user?.email;
  return email ? normaliseEmail(email) : null;
}

/** Whether the signed-in reader already gets the digest, so SignupOffer
 * knows whether to show the one-tap button. */
export async function GET() {
  const email = await sessionEmail();
  if (!email) return SIGNED_OUT();
  try {
    return NextResponse.json({ subscribed: !!(await getSubscriberByEmail(email)) }, { headers: NO_STORE });
  } catch (err) {
    console.error("[curio:subscribe] me lookup failed:", err instanceof Error ? err.name : "unknown");
    return FAILED();
  }
}

/** One-tap subscribe for a signed-in reader (approved 2026-10-18): their
 * magic-link sign-in already proved the address, so no confirmation email.
 * Only ever the session's own address; the body carries attribution only.
 * It acts on the session cookie, so it carries app/api/traffic's CSRF guard:
 * a text/plain body would let any third-party page POST without a CORS
 * preflight, so require JSON; and refuse browsers that say the request is
 * cross-site. A missing Sec-Fetch-Site (older browsers, curl) is fine. */
export async function POST(req: NextRequest) {
  if (!req.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: "Unsupported content type." }, { status: 415, headers: NO_STORE });
  }
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403, headers: NO_STORE });
  }
  const email = await sessionEmail();
  if (!email) return SIGNED_OUT();
  const body = (await req.json().catch(() => ({}))) as { placement?: unknown; source?: unknown } | null;
  const source = isTrafficSource(body?.source) ? body.source : "direct";
  const placement = isSignupPlacement(body?.placement) ? body.placement : undefined;

  try {
    if (await getSubscriberByEmail(email)) return NextResponse.json({ ok: true }, { headers: NO_STORE });
    await upsertSubscriber(email);
  } catch (err) {
    console.error("[curio:subscribe] one-tap failed:", err instanceof Error ? err.name : "unknown");
    return FAILED();
  }

  try {
    await recordTrafficEvent({ kind: "signup", source });
    if (placement) await recordTrafficEvent({ kind: "signup-at", placement });
  } catch (err) {
    console.error("traffic: one-tap record failed", err instanceof Error ? err.name : "unknown");
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
