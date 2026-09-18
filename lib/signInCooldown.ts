import { redis } from "./redis";

/** Protects the Resend quota (shared with the daily digest — see
 * lib/email.ts) from being exhausted by repeated sign-in requests for the
 * same address. Claims a short-lived Redis lock the first time an address
 * asks within the window; a request for the same address before the lock
 * expires returns false and the caller (lib/auth.ts's
 * sendVerificationRequest) skips sending. Auth.js's own client response
 * stays the same "check your email" success either way — it deliberately
 * never reveals whether a given address is a real account or whether an
 * email was actually sent, and this doesn't change that. No-ops (always
 * allows sending) without Upstash configured, matching every other
 * Redis-backed feature in this app. */
const COOLDOWN_SECONDS = 60;

function cooldownKey(email: string): string {
  return `curio:signincooldown:${email.trim().toLowerCase()}`;
}

export async function claimSignInSend(email: string): Promise<boolean> {
  if (!redis) return true;
  const claimed = await redis.set(cooldownKey(email), "1", { nx: true, ex: COOLDOWN_SECONDS });
  return claimed !== null;
}
