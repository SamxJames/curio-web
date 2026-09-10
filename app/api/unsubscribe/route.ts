import { NextRequest, NextResponse } from "next/server";
import { decodeUnsubscribeToken } from "@/lib/email";
import { removeSubscriber } from "@/lib/db";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/unsubscribed?ok=0", req.url));
  }
  try {
    const email = decodeUnsubscribeToken(token);
    await removeSubscriber(email);
    return NextResponse.redirect(new URL("/unsubscribed?ok=1", req.url));
  } catch {
    return NextResponse.redirect(new URL("/unsubscribed?ok=0", req.url));
  }
}
