import { redis } from "./redis";
import type { PlayState } from "./storage";

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

function lastSeenKey(userId: string): string {
  return `curio:user:${userId}:lastSeen`;
}

/** Records that a signed-in account was active today (UTC calendar date) —
 * feeds the admin portal's retention metrics. Deliberately not awaited by
 * its callers (see app/page.tsx, app/collection/page.tsx,
 * app/story/[slug]/page.tsx): a failed write here must never block or
 * break page rendering, mirroring lib/storage.ts's fire-and-forget account
 * sync. Skips the write once today's date is already stored, so visiting
 * the same page many times in a day costs one extra GET and no SET after
 * the first. */
export async function recordUserSeen(userId: string, date: Date = new Date()): Promise<void> {
  if (!redis) return;
  const dateStr = date.toISOString().slice(0, 10);
  const key = lastSeenKey(userId);
  const existing = await redis.get<string>(key);
  if (existing === dateStr) return;
  await redis.set(key, dateStr);
}

export async function getUserLastSeen(userId: string): Promise<string | null> {
  if (!redis) return null;
  return redis.get<string>(lastSeenKey(userId));
}

// `curio:user:<id>:<suffix>` — every scan below needs to recover the
// userId from the key name, and every id is a crypto.randomUUID() (no
// colons), so slicing off the fixed prefix/suffix is safe.
const USER_KEY_PREFIX = "curio:user:";

function parseUserKey(key: string, suffix: string): string {
  return key.slice(USER_KEY_PREFIX.length, key.length - suffix.length);
}

/** Every account's last-seen date, keyed by userId. Empty when Upstash
 * isn't configured. */
export async function getAllUserLastSeen(): Promise<Record<string, string>> {
  if (!redis) return {};
  const keys = await redis.keys(`${USER_KEY_PREFIX}*:lastSeen`);
  if (keys.length === 0) return {};
  const values = await redis.mget<string[]>(...keys);
  const result: Record<string, string> = {};
  keys.forEach((key, i) => {
    const value = values[i];
    if (value) result[parseUserKey(key, ":lastSeen")] = value;
  });
  return result;
}

/** Every account's join date, keyed by userId — the same data
 * getUserJoinedAt reads one account at a time, scanned across every
 * account for the admin portal's growth and retention views. */
export async function getAllUserJoinDates(): Promise<Record<string, string>> {
  if (!redis) return {};
  const keys = await redis.keys(`${USER_KEY_PREFIX}*:joinedAt`);
  if (keys.length === 0) return {};
  const values = await redis.mget<string[]>(...keys);
  const result: Record<string, string> = {};
  keys.forEach((key, i) => {
    const value = values[i];
    if (value) result[parseUserKey(key, ":joinedAt")] = value;
  });
  return result;
}

export type UserActivity = { userId: string; joinedAt: string; lastSeen: string | null };

/** Every account with a recorded join date, paired with its last-seen date
 * (or null if it's never been recorded — true for every account until it
 * next visits a page that calls recordUserSeen). The shape
 * lib/adminStats.ts's computeRollingRetention consumes directly. */
export async function getAllUserActivity(): Promise<UserActivity[]> {
  const [joinDates, lastSeen] = await Promise.all([getAllUserJoinDates(), getAllUserLastSeen()]);
  return Object.entries(joinDates).map(([userId, joinedAt]) => ({
    userId,
    joinedAt,
    lastSeen: lastSeen[userId] ?? null,
  }));
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

function playStateKey(userId: string, puzzleDate: string): string {
  return `curio:user:${userId}:play:${puzzleDate}`;
}

export async function getUserPlayState(userId: string, puzzleDate: string): Promise<PlayState | null> {
  if (!redis) return null;
  return redis.get<PlayState>(playStateKey(userId, puzzleDate));
}

export async function setUserPlayState(
  userId: string,
  puzzleDate: string,
  state: PlayState
): Promise<void> {
  if (!redis) return;
  await redis.set(playStateKey(userId, puzzleDate), state);
}
