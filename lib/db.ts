import { promises as fs } from "fs";
import path from "path";
import { redis, usingUpstash } from "./redis";

export type Subscriber = {
  email: string;
  hour: number; // 0-23, in UTC
  createdAt: string;
};

const HOUR_INDEX_PREFIX = "curio:hour:"; // set of emails, per UTC hour
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
  hour: number
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const record: Subscriber = {
    email: normalizedEmail,
    hour,
    createdAt: new Date().toISOString(),
  };

  if (redis) {
    const existing = await redis.hgetall<Subscriber>(
      SUBSCRIBER_PREFIX + normalizedEmail
    );
    if (existing?.hour !== undefined && existing.hour !== hour) {
      await redis.srem(HOUR_INDEX_PREFIX + existing.hour, normalizedEmail);
    }
    await redis.hset(SUBSCRIBER_PREFIX + normalizedEmail, { ...record });
    await redis.sadd(HOUR_INDEX_PREFIX + hour, normalizedEmail);
    return;
  }

  const db = await readLocalDb();
  db[normalizedEmail] = record;
  await writeLocalDb(db);
}

export async function removeSubscriber(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();

  if (redis) {
    const existing = await redis.hgetall<Subscriber>(
      SUBSCRIBER_PREFIX + normalizedEmail
    );
    if (existing?.hour !== undefined) {
      await redis.srem(HOUR_INDEX_PREFIX + existing.hour, normalizedEmail);
    }
    await redis.del(SUBSCRIBER_PREFIX + normalizedEmail);
    return;
  }

  const db = await readLocalDb();
  delete db[normalizedEmail];
  await writeLocalDb(db);
}

export async function getSubscribersForHour(hour: number): Promise<string[]> {
  if (redis) {
    return redis.smembers(HOUR_INDEX_PREFIX + hour);
  }
  const db = await readLocalDb();
  return Object.values(db)
    .filter((s) => s.hour === hour)
    .map((s) => s.email);
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
