import { createHmac, timingSafeEqual } from "node:crypto";

/** Dev/test only. Production never falls back to it: unsubscribeSecret()
 * returns null there, and the cron refuses to send. */
const DEV_SECRET = "curio-dev-only-unsubscribe-secret";

/** Keeps this HMAC distinct from any other thing ever signed with the
 * same secret. Bump the version to invalidate every link at once. */
const CONTEXT = "curio:unsubscribe:v1:";

/** Same normalisation lib/db.ts applies to subscriber keys. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function unsubscribeSecret(): string | null {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (secret) return secret;
  return process.env.NODE_ENV === "production" ? null : DEV_SECRET;
}

function mac(email: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(CONTEXT + email).digest();
}

/** `base64url(email).base64url(hmac)`. No expiry on purpose: a link in a
 * months-old digest should still work. */
export function signUnsubscribeToken(email: string, secret: string): string {
  const normalised = normaliseEmail(email);
  const payload = Buffer.from(normalised).toString("base64url");
  return `${payload}.${mac(normalised, secret).toString("base64url")}`;
}

/** The address a token was signed for, or null for anything forged,
 * tampered with, signed under another secret, or in the old unsigned
 * base64(email) format (it has no "." part, so it fails the shape check). */
export function verifyUnsubscribeToken(token: string, secret: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const email = Buffer.from(parts[0], "base64url").toString("utf-8");
  if (!email.includes("@") || email !== normaliseEmail(email)) return null;

  const given = Buffer.from(parts[1], "base64url");
  const expected = mac(email, secret);
  if (given.length !== expected.length) return null;
  return timingSafeEqual(given, expected) ? email : null;
}

/** "s***@gmail.com" — enough for someone to recognise their own address
 * on the confirm page without spelling it out to whoever holds the link. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
}
