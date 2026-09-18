import { NextRequest, NextResponse } from "next/server";
import { consumeDeviceLinkToken, sessionCookieOptions } from "@/lib/deviceLink";

/** Polled by app/login/page.tsx while it's showing "check your email" — once
 * the matching attempt shows up (because the link was verified, possibly on
 * a different browser), copies that session cookie onto this response so
 * the polling tab ends up signed in too. */
export async function GET(req: NextRequest) {
  const attempt = req.nextUrl.searchParams.get("attempt");
  if (!attempt) return NextResponse.json({ linked: false });

  const cookie = await consumeDeviceLinkToken(attempt);
  if (!cookie) return NextResponse.json({ linked: false });

  const res = NextResponse.json({ linked: true });
  res.cookies.set(cookie.name, cookie.value, sessionCookieOptions(cookie.name));
  return res;
}
