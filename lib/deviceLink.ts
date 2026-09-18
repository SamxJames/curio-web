import type { NextRequest } from "next/server";
import { redis } from "./redis";

/** Support for "sign in here, verify on another device" — when someone
 * requests a magic link on one browser (e.g. a laptop) but opens it from
 * another (e.g. their phone's mail app), the laptop tab is otherwise stuck
 * on "check your email" forever. The login page hands each attempt a random
 * id; once the link is verified anywhere, app/api/auth/device-link stashes
 * that browser's fresh session cookie here for a few minutes, and the
 * waiting tab's poll (app/api/auth/device-link/status) picks it up and
 * copies the cookie onto itself. Both tabs end up sharing one session
 * record — equivalent to opening the same account in two browsers by hand. */

type SessionCookie = { name: string; value: string };

function deviceLinkKey(attemptId: string): string {
  return `curio:devicelink:${attemptId}`;
}

// How long a pending attempt is kept — generous enough to cover someone
// checking their phone a few minutes after requesting the link, but short
// enough that a stale, unconsumed token doesn't linger in Redis.
const DEVICE_LINK_TTL_SECONDS = 10 * 60;

// Auth.js's own default session cookie maxAge (30 days), mirrored here since
// we're setting the cookie ourselves rather than going through its normal
// sign-in response — see defaultCookies() in @auth/core.
const SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Finds the Auth.js session-token cookie on an incoming request, whatever
 * its exact name — `authjs.session-token` in development, or
 * `__Secure-authjs.session-token` wherever the deployment is served over
 * HTTPS (Auth.js decides the prefix itself; not something this app pins
 * down, see lib/auth.ts). */
export function findSessionCookie(req: NextRequest): SessionCookie | null {
  const match = req.cookies.getAll().find((c) => c.name.endsWith("session-token"));
  return match ? { name: match.name, value: match.value } : null;
}

/** Cookie options to reuse when setting that same cookie on a second
 * browser — must match what Auth.js itself would have set, including the
 * `secure`/`__Secure-` pairing (mismatching that gets the cookie silently
 * rejected by the browser). */
export function sessionCookieOptions(cookieName: string) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: cookieName.startsWith("__Secure-") || cookieName.startsWith("__Host-"),
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  };
}

/** Records that `attemptId` has now been verified, for the device that
 * requested it to pick up on its next poll. No-ops without Upstash
 * configured (mirrors every other Redis-backed feature in this app — auth
 * itself already doesn't work without it, see lib/auth.ts). */
export async function storeDeviceLinkToken(attemptId: string, cookie: SessionCookie): Promise<void> {
  if (!redis) return;
  await redis.set(deviceLinkKey(attemptId), cookie, { ex: DEVICE_LINK_TTL_SECONDS });
}

/** Reads and deletes a pending attempt's cookie in one go — single-use, so
 * a slow last poll racing a fast one can't both apply it. */
export async function consumeDeviceLinkToken(attemptId: string): Promise<SessionCookie | null> {
  if (!redis) return null;
  const key = deviceLinkKey(attemptId);
  const value = await redis.get<SessionCookie>(key);
  if (!value) return null;
  await redis.del(key);
  return value;
}
