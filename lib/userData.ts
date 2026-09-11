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
