import { createHmac, timingSafeEqual } from "node:crypto";
import { normaliseEmail } from "./unsubscribeToken";
import { isTrafficSource, type TrafficSource } from "./traffic";

/** A distinct HMAC context from unsubscribe's, so neither kind of token can
 * ever pass as the other even though both use UNSUBSCRIBE_SECRET. Bump the
 * version to invalidate every outstanding confirm link at once. */
const CONTEXT = "curio:confirm:v1:";

/** How long a confirm link works. Nothing is stored for an unconfirmed
 * address apart from a 10-minute cooldown key (curio:confirmcooldown:<email>)
 * — the expiry lives in the signed token itself. */
export const CONFIRM_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Tolerated clock skew for a token "issued in the future". */
const MAX_SKEW_SECONDS = 300;

export type ConfirmClaim = { email: string; source: TrafficSource };

function mac(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(CONTEXT + payload).digest();
}

const unixSeconds = (d: Date) => Math.floor(d.getTime() / 1000);

/** `base64url(JSON{e,s,t}).base64url(hmac)`. `s` is the arrival source the
 * signup came from (lib/traffic.ts), carried so the confirmed signup is
 * credited to it; `t` is when the link was issued. */
export function signConfirmToken(email: string, source: TrafficSource, secret: string, now: Date = new Date()): string {
  const payload = Buffer.from(
    JSON.stringify({ e: normaliseEmail(email), s: source, t: unixSeconds(now) })
  ).toString("base64url");
  return `${payload}.${mac(payload, secret).toString("base64url")}`;
}

/** The address and source a token was signed for, or null if it's forged,
 * tampered with, signed under another secret, expired, from the future, or
 * malformed in any way. Never throws. */
export function verifyConfirmToken(token: string, secret: string, now: Date = new Date()): ConfirmClaim | null {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payload, sig] = parts;

  const given = Buffer.from(sig, "base64url");
  const expected = mac(payload, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let data: unknown;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const { e, s, t } = data as Record<string, unknown>;
  if (typeof e !== "string" || !e.includes("@") || e !== normaliseEmail(e)) return null;
  if (!isTrafficSource(s)) return null;
  if (typeof t !== "number" || !Number.isFinite(t)) return null;

  const age = unixSeconds(now) - t;
  if (age > CONFIRM_TTL_SECONDS || age < -MAX_SKEW_SECONDS) return null;
  return { email: e, source: s };
}
