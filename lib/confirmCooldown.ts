import { redis } from "./redis";
import { normaliseEmail } from "./unsubscribeToken";

/** One confirmation email per address per 10 minutes, so repeated form
 * submissions can't drain the Resend quota the digest and sign-in share.
 * Same NX-claim pattern as lib/signInCooldown.ts, longer window: a signup
 * has no urgency. Without Upstash it always allows. */
const COOLDOWN_SECONDS = 10 * 60;

const cooldownKey = (email: string) => `curio:confirmcooldown:${normaliseEmail(email)}`;

export async function claimConfirmSend(email: string): Promise<boolean> {
  if (!redis) return true;
  const claimed = await redis.set(cooldownKey(email), "1", { nx: true, ex: COOLDOWN_SECONDS });
  return claimed !== null;
}

/** Called when the send itself failed, so the person can retry at once
 * rather than silently getting nothing for 10 minutes. */
export async function releaseConfirmSend(email: string): Promise<void> {
  if (!redis) return;
  await redis.del(cooldownKey(email));
}
