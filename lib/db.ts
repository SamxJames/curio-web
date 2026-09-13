import { promises as fs } from "fs";
import path from "path";
import { redis, usingUpstash } from "./redis";

export type Subscriber = {
  email: string;
  hour: number; // 0-23, in UTC
  createdAt: string;
};

const SUBSCRIBER_PREFIX = "curio:subscriber:"; // hash, keyed by email

// --- Local JSON fallback (dev only — serverless filesystems are ephemeral,
// so this is not a substitute for Upstash in production; it only exists so
// the subscribe flow is testable without external credentials.) ---
const LOCAL_DB_PATH = path.join(process.cwd(), ".data", "subscribers.json");

async function readLocalDb(): Promise<Record<string, Subscriber>> {
  try {
    const raw = await fs.readFile(LOCAL_DB_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeLocalDb(db: Record<string, Subscriber>) {
  await fs.mkdir(path.dirname(LOCAL_DB_PATH), { recursive: true });
  await fs.writeFile(LOCAL_DB_PATH, JSON.stringify(db, null, 2));
}

export async function upsertSubscriber(
  email: string,
  hour: number = 9
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const record: Subscriber = {
    email: normalizedEmail,
    hour,
    createdAt: new Date().toISOString(),
  };

  if (redis) {
    await redis.hset(SUBSCRIBER_PREFIX + normalizedEmail, { ...record });
    return;
  }

  const db = await readLocalDb();
  db[normalizedEmail] = record;
  await writeLocalDb(db);
}

export async function removeSubscriber(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();

  if (redis) {
    await redis.del(SUBSCRIBER_PREFIX + normalizedEmail);
    return;
  }

  const db = await readLocalDb();
  delete db[normalizedEmail];
  await writeLocalDb(db);
}

/** Every subscribed email, regardless of the delivery hour they picked (or
 * were defaulted to) — used by the daily cron, which only ever fires once
 * a day on the Hobby plan (see the send-daily route's own comment). The
 * hour-bucketed index (`HOUR_INDEX_PREFIX`) predates that realization and
 * is unused by the send path now; this reads subscriber records directly. */
export async function getAllSubscribers(): Promise<string[]> {
  if (redis) {
    const keys = await redis.keys(`${SUBSCRIBER_PREFIX}*`);
    return keys.map((key) => key.slice(SUBSCRIBER_PREFIX.length));
  }
  const db = await readLocalDb();
  return Object.values(db).map((s) => s.email);
}

/** Every subscriber's full record (not just the email), for the admin
 * portal's growth-by-signup-date view — getAllSubscribers only returns
 * email strings because that's all the daily cron ever needed. */
export async function getAllSubscriberRecords(): Promise<Subscriber[]> {
  if (redis) {
    const keys = await redis.keys(`${SUBSCRIBER_PREFIX}*`);
    if (keys.length === 0) return [];
    const records = await Promise.all(keys.map((key) => redis!.hgetall<Subscriber>(key)));
    return records.filter((r): r is Subscriber => !!r?.email);
  }
  const db = await readLocalDb();
  return Object.values(db);
}

export async function getSubscriberByEmail(email: string): Promise<Subscriber | null> {
  const normalizedEmail = email.trim().toLowerCase();

  if (redis) {
    const existing = await redis.hgetall<Subscriber>(SUBSCRIBER_PREFIX + normalizedEmail);
    return existing?.email ? existing : null;
  }

  const db = await readLocalDb();
  return db[normalizedEmail] ?? null;
}

export const usingLocalFallback = !usingUpstash;
