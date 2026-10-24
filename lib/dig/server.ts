import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";
import { DAY_MS, dayKey, dayStart } from "../day";
import { digLaunchDate, isPastDay } from "./clock";
import { devDay } from "./devDay";
import { funnelField, planFinish, type DigEvent } from "./events";
import { digKeys, type DigManifest } from "./keys";
import { encodeDay } from "./payload";
import type { DigDay } from "./types";

/** Server-only. Reads use Upstash in production and preview; writes only in production
 * (local dev can share production's Upstash, and must never read or write it). Locally,
 * days come from the pipeline's .dig-out/ files, else lib/dig/devDay.ts.
 *
 * Every function checks its gate before it touches a client, so a local run never builds
 * one that could reach production. */

export const readsRedis = () => process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview";
export const writesRedis = () => process.env.VERCEL_ENV === "production";

/** Built on first use, not at import. DIG_REDIS_REST_URL/TOKEN move the game onto its own
 * database later (architecture §12) without a code change; otherwise the site's shared
 * client, loaded lazily so importing this module never constructs lib/redis.ts's client. */
let client: Promise<Redis | null> | undefined;
function digRedis(): Promise<Redis | null> {
  client ??= (async () => {
    const url = process.env.DIG_REDIS_REST_URL, token = process.env.DIG_REDIS_REST_TOKEN;
    if (url && token) return new Redis({ url, token });
    return (await import("../redis")).redis;
  })();
  return client;
}

const localDir = () => path.resolve(process.cwd(), process.env.DIG_LOCAL_DIR ?? ".dig-out");
const toCounts = (h: Record<string, unknown> | null | undefined) =>
  Object.fromEntries(Object.entries(h ?? {}).map(([k, v]) => [k, Number(v) || 0]));

export async function readDay(date: string): Promise<DigDay | null> {
  if (readsRedis()) {
    const r = await digRedis();
    return (await r?.get<DigDay>(digKeys.day(date))) ?? null;
  }
  const file = path.join(localDir(), "days", `${date}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as DigDay;
  return encodeDay(devDay(date));
}

export async function readManifest(): Promise<DigManifest | null> {
  if (!readsRedis()) return null;
  const r = await digRedis();
  return (await r?.get<DigManifest>(digKeys.manifest)) ?? null;
}

async function builtDates(now: Date): Promise<string[]> {
  if (readsRedis()) return Object.keys((await readManifest())?.days ?? {});
  const days = path.join(localDir(), "days");
  if (existsSync(days)) return readdirSync(days).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, 10));
  const out: string[] = [];
  for (let t = dayStart(dayKey(now)).getTime() - DAY_MS, i = 0; i < 60; i++, t -= DAY_MS) out.push(dayKey(new Date(t)));
  return out;
}

/** Launched days before today, newest first. */
export async function pastDates(now: Date = new Date()): Promise<string[]> {
  const launch = digLaunchDate();
  return (await builtDates(now)).filter((d) => isPastDay(d, now, launch)).sort().reverse();
}

export async function recordFunnel(date: string, ev: DigEvent): Promise<void> {
  const field = funnelField(ev);
  if (!field || !writesRedis()) return;
  const r = await digRedis();
  if (r) await r.hincrby(digKeys.funnel(date), field, 1);
}

/** One pipelined round trip: the score bucket, the funnel, rejected guesses, and the
 * day's spread read back for the end screen's percentile. */
export async function recordFinish(ev: Extract<DigEvent, { kind: "finish" }>): Promise<Record<string, number>> {
  if (!writesRedis()) return {};
  const r = await digRedis();
  if (!r) return {};
  const p = r.pipeline();
  for (const [key, field, by] of planFinish(ev)) p.hincrby(key, field, by);
  p.hgetall(digKeys.scores(ev.date));
  const results = await p.exec();
  return toCounts(results.at(-1) as Record<string, unknown> | null);
}

/** The guess is already a normalised key: parseDigEvent (events.ts cleanGuess) folds it
 * with normalizeKey, so "ice cream" and "icecream" count as one. It is stored as given. */
export async function recordClaim(ev: Extract<DigEvent, { kind: "claim" }>): Promise<void> {
  if (!writesRedis()) return;
  const r = await digRedis();
  if (r) await r.hincrby(digKeys.claims(ev.date, ev.prompt), ev.guess, 1);
}

/** Everything the health cron reads, in one pipelined round trip. */
export async function healthReads(today: string, tomorrow: string, month: string) {
  if (!readsRedis()) return null;
  const r = await digRedis();
  if (!r) return null;
  const p = r.pipeline();
  p.get(digKeys.manifest);
  p.exists(digKeys.day(today));
  p.exists(digKeys.day(tomorrow));
  p.get(digKeys.usageAlert(month));
  const [manifest, todayExists, tomorrowExists, usageSent] = await p.exec();
  return {
    manifest: (manifest as DigManifest | null) ?? null,
    todayExists: Number(todayExists) === 1,
    tomorrowExists: Number(tomorrowExists) === 1,
    usageSent: Number(usageSent) || 0,
  };
}

const COUNTER_TTL = 35 * 24 * 60 * 60, FUNNEL_TTL = 90 * 24 * 60 * 60;

/** HINCRBY sets no expiry, and adding EXPIRE to every event would double the writes, so
 * the daily cron sets yesterday's (architecture §8): 16 commands a day. */
export async function housekeep(yesterday: string): Promise<void> {
  if (!writesRedis()) return;
  const r = await digRedis();
  if (!r) return;
  const p = r.pipeline();
  p.expire(digKeys.scores(yesterday), COUNTER_TTL);
  p.expire(digKeys.funnel(yesterday), FUNNEL_TTL);
  for (let i = 0; i < 7; i++) {
    p.expire(digKeys.rejected(yesterday, i), COUNTER_TTL);
    p.expire(digKeys.claims(yesterday, i), COUNTER_TTL);
  }
  await p.exec();
}

export async function writeHeartbeat(at: Date): Promise<void> {
  if (!writesRedis()) return;
  const r = await digRedis();
  if (r) await r.set(digKeys.heartbeat, at.toISOString());
}

export async function markUsageAlert(month: string, level: number): Promise<void> {
  if (!writesRedis()) return;
  const r = await digRedis();
  if (r) await r.set(digKeys.usageAlert(month), level, { ex: 40 * 24 * 60 * 60 });
}

export async function funnelDays(dates: string[]): Promise<Record<string, Record<string, number>>> {
  if (!readsRedis() || !dates.length) return {};
  const r = await digRedis();
  if (!r) return {};
  const p = r.pipeline();
  for (const d of dates) p.hgetall(digKeys.funnel(d));
  const results = await p.exec();
  const out: Record<string, Record<string, number>> = {};
  dates.forEach((d, i) => {
    const h = toCounts(results[i] as Record<string, unknown> | null);
    if (Object.keys(h).length) out[d] = h;
  });
  return out;
}
