import { redis } from "./redis";

export type MetaChannel = "threads" | "instagram";

/** Meta's long-lived tokens last 60 days from their last refresh and can
 * be refreshed once they're 24h old. Refreshing weekly on the daily run
 * keeps them alive with weeks to spare. */
export const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 10_000;

type Stored = { token: string; refreshedAt: string; seed: string };

const ENV: Record<MetaChannel, string> = { threads: "THREADS_ACCESS_TOKEN", instagram: "INSTAGRAM_ACCESS_TOKEN" };
const REFRESH: Record<MetaChannel, (token: string) => string> = {
  threads: (t) => `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(t)}`,
  instagram: (t) => `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(t)}`,
};
const key = (channel: MetaChannel) => `curio:social:token:${channel}`;

/** The token to post with. Production keeps a refreshed copy in Redis
 * (the env value is the seed and the on switch); everywhere else just uses env, so a
 * local run can never read or rotate production's token. */
export async function getMetaToken(channel: MetaChannel, now: Date = new Date()): Promise<string | null> {
  const envToken = process.env[ENV[channel]] || null;
  if (process.env.VERCEL_ENV !== "production" || !redis) return envToken;
  // Env stays the off switch: removing the token in Vercel stops posting,
  // even though Redis still holds a refreshed copy.
  if (!envToken) return null;

  let stored = await redis.get<Stored>(key(channel));
  if (!stored || stored.seed !== envToken) {
    // First run, or the owner replaced the token in Vercel: start from it.
    // The epoch refreshedAt means "age unknown", so it's due for refresh.
    stored = { token: envToken, refreshedAt: new Date(0).toISOString(), seed: envToken };
  }

  if (now.getTime() - Date.parse(stored.refreshedAt) < REFRESH_AFTER_MS) return stored.token;

  let failure: string;
  try {
    const res = await fetch(REFRESH[channel](stored.token), { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.ok) {
      const { access_token } = (await res.json()) as { access_token?: string };
      if (access_token) {
        const next: Stored = { token: access_token, refreshedAt: now.toISOString(), seed: stored.seed };
        await redis.set(key(channel), next);
        return next.token;
      }
      failure = "no access_token in response";
    } else {
      failure = `HTTP ${res.status}`;
    }
  } catch (err) {
    // Error name only: the request URL carries the token, and a message could echo it.
    failure = err instanceof Error ? err.name : "unknown error";
  }
  console.warn(`[curio:${channel}] token refresh failed:`, failure);
  // Persist so a first-run seed survives; refreshedAt stays old, so tomorrow retries.
  await redis.set(key(channel), stored);
  return stored.token;
}
