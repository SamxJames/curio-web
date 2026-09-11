import { redis } from "./redis";

function joinedKey(userId: string): string {
  return `curio:user:${userId}:joinedAt`;
}

/** Records the UTC calendar date (YYYY-MM-DD) an account was created, used
 * to anchor its personalized word rotation. `nx: true` makes this a no-op
 * if it's ever called twice for the same user (e.g. a duplicate event). */
export async function recordUserJoined(userId: string, date: Date = new Date()): Promise<void> {
  if (!redis) return;
  const dateStr = date.toISOString().slice(0, 10);
  await redis.set(joinedKey(userId), dateStr, { nx: true });
}

/** UTC calendar date (YYYY-MM-DD) the account joined, or null if unknown
 * (Upstash not configured, or the record predates this feature). */
export async function getUserJoinedAt(userId: string): Promise<string | null> {
  if (!redis) return null;
  return redis.get<string>(joinedKey(userId));
}

function favoritesKey(userId: string): string {
  return `curio:user:${userId}:favorites`;
}

function importedKey(userId: string): string {
  return `curio:user:${userId}:importedLocalFavorites`;
}

export async function getUserFavorites(userId: string): Promise<Set<string>> {
  if (!redis) return new Set();
  const slugs = await redis.smembers(favoritesKey(userId));
  return new Set(slugs);
}

export async function setUserFavorite(
  userId: string,
  slug: string,
  favorited: boolean
): Promise<void> {
  if (!redis) return;
  if (favorited) await redis.sadd(favoritesKey(userId), slug);
  else await redis.srem(favoritesKey(userId), slug);
}

/** One-time import of a browser's pre-account favorites into the account's
 * server-side set. Returns false (and imports nothing) if this account has
 * already gone through an import before, so the client's "import?" prompt
 * can only ever add slugs once per account. */
export async function importFavoritesOnce(userId: string, slugs: string[]): Promise<boolean> {
  if (!redis) return false;
  // The NX claim has to happen first — it's what makes this safe to call
  // multiple times concurrently without double-importing. But that leaves a
  // window where the claim succeeds and the SADD below then fails, which
  // would otherwise permanently "spend" the flag with nothing imported. To
  // avoid that, a SADD failure releases the claim (best-effort) so a later
  // retry isn't silently lost, and the error propagates instead of this
  // function resolving as if nothing went wrong.
  const firstTime = await redis.set(importedKey(userId), "1", { nx: true });
  if (firstTime === null) return false;
  try {
    if (slugs.length > 0) {
      const [first, ...rest] = slugs;
      await redis.sadd(favoritesKey(userId), first, ...rest);
    }
  } catch (err) {
    await redis.del(importedKey(userId)).catch(() => {});
    throw err;
  }
  return true;
}
