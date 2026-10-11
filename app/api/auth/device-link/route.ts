import { NextRequest, NextResponse } from "next/server";
import { findSessionCookie, storeDeviceLinkToken } from "@/lib/deviceLink";
import { safeReturnPath } from "@/lib/returnPath";

/** Where signIn("resend", { callbackUrl }) sends the browser after a magic
 * link is verified — see app/login/page.tsx. Auth.js has already set the
 * session cookie on *this* request by the time it redirects here, so this
 * just hands that cookie off (keyed by the attempt id the login page made
 * up) for whichever browser is still waiting on it, then continues on to
 * the page the person signed in from (`next`, checked by safeReturnPath). */
export async function GET(req: NextRequest) {
  const attempt = req.nextUrl.searchParams.get("attempt");
  const cookie = findSessionCookie(req);
  if (attempt && cookie) {
    await storeDeviceLinkToken(attempt, cookie);
  }
  return NextResponse.redirect(new URL(safeReturnPath(req.nextUrl.searchParams.get("next")), req.url));
}
