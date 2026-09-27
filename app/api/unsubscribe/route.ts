import { NextRequest, NextResponse } from "next/server";
import { removeSubscriber } from "@/lib/db";
import { unsubscribeSecret, verifyUnsubscribeToken } from "@/lib/unsubscribeToken";

function verifiedEmail(token: string | null): string | null {
  const secret = unsubscribeSecret();
  if (!token || !secret) return null;
  return verifyUnsubscribeToken(token, secret);
}

/** Never unsubscribes. Link scanners (Outlook Safe Links, corporate mail
 * gateways) prefetch every GET link in an email, so a GET that mutated
 * would unsubscribe people who never clicked. It only forwards to the
 * confirm page, whose button POSTs back here. */
export function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.redirect(new URL("/unsubscribed?ok=0", req.url));
  const confirm = new URL("/unsubscribe", req.url);
  confirm.searchParams.set("token", token);
  return NextResponse.redirect(confirm);
}

/** Two callers, one token location (the query string):
 * - RFC 8058 one-click, POSTed by a mailbox provider's own unsubscribe
 *   button from the List-Unsubscribe header, body `List-Unsubscribe=One-Click`.
 *   No browser is involved, so it gets a status code, not a redirect.
 * - The /unsubscribe confirm page's form, which gets a 303 to /unsubscribed.
 * Removing an address that's already gone is a no-op, so repeats succeed. */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const oneClick = form?.get("List-Unsubscribe") === "One-Click";
  const email = verifiedEmail(req.nextUrl.searchParams.get("token"));

  let ok = false;
  if (email) {
    try {
      await removeSubscriber(email);
      ok = true;
    } catch (err) {
      console.error("[curio:unsubscribe] removeSubscriber failed:", err);
    }
  }

  if (oneClick) {
    return ok
      ? new NextResponse(null, { status: 200 })
      : NextResponse.json({ error: email ? "Unsubscribe failed" : "Invalid token" }, { status: email ? 500 : 400 });
  }
  return NextResponse.redirect(new URL(`/unsubscribed?ok=${ok ? 1 : 0}`, req.url), 303);
}
