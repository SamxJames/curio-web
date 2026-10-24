import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";
import { digKeys, type DigManifest } from "../../lib/dig/keys";
import type { DigDay } from "../../lib/dig/types";

export interface DigSink {
  readonly name: string;
  readManifest(): Promise<DigManifest | null>;
  writeManifest(m: DigManifest): Promise<void>;
  readDay(date: string): Promise<DigDay | null>;
  writeDay(day: DigDay): Promise<void>;
  readExtras(): Promise<Record<string, string[]>>;
  writeExtras(e: Record<string, string[]>): Promise<void>;
  readAdjudicated(): Promise<string[]>;
  writeAdjudicated(list: string[]): Promise<void>;
  readLog(kind: "rej" | "claim", date: string, index: number): Promise<Record<string, number>>;
  readHeartbeat(): Promise<string | null>;
}

/** Local runs: JSON files under one folder (default .dig-out/, gitignored). The site's
 * dev mode reads days from <dir>/days/<date>.json. */
export class FileSink implements DigSink {
  readonly name = "file";
  constructor(private dir: string) { mkdirSync(path.join(dir, "days"), { recursive: true }); }
  private read<T>(rel: string, fallback: T): T {
    const f = path.join(this.dir, rel);
    return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as T) : fallback;
  }
  private write(rel: string, value: unknown) {
    const f = path.join(this.dir, rel);
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, JSON.stringify(value, null, 1));
  }
  async readManifest() { return this.read<DigManifest | null>("manifest.json", null); }
  async writeManifest(m: DigManifest) { this.write("manifest.json", m); }
  async readDay(date: string) { return this.read<DigDay | null>(`days/${date}.json`, null); }
  async writeDay(day: DigDay) { this.write(`days/${day.date}.json`, day); }
  async readExtras() { return this.read<Record<string, string[]>>("extras.json", {}); }
  async writeExtras(e: Record<string, string[]>) { this.write("extras.json", e); }
  async readAdjudicated() { return this.read<string[]>("adjudicated.json", []); }
  async writeAdjudicated(list: string[]) { this.write("adjudicated.json", list); }
  async readLog(kind: "rej" | "claim", date: string, index: number) { return this.read<Record<string, number>>(`logs/${kind}-${date}-${index}.json`, {}); }
  async readHeartbeat() { return this.read<string | null>("heartbeat.json", null); }
}

/** Production Upstash. Constructible only inside GitHub Actions, so a local run can
 * never write production Redis (Global constraints). */
export class RedisSink implements DigSink {
  readonly name = "redis";
  private constructor(private redis: Redis) {}
  static create(): RedisSink {
    if (process.env.GITHUB_ACTIONS !== "true") throw new Error("RedisSink runs only inside GitHub Actions");
    const url = process.env.DIG_REDIS_REST_URL, token = process.env.DIG_REDIS_REST_TOKEN;
    if (!url || !token) throw new Error("DIG_REDIS_REST_URL / DIG_REDIS_REST_TOKEN are not set");
    return new RedisSink(new Redis({ url, token }));
  }
  async readManifest() { return (await this.redis.get<DigManifest>(digKeys.manifest)) ?? null; }
  async writeManifest(m: DigManifest) { await this.redis.set(digKeys.manifest, m); }
  async readDay(date: string) { return (await this.redis.get<DigDay>(digKeys.day(date))) ?? null; }
  async writeDay(day: DigDay) { await this.redis.set(digKeys.day(day.date), day); }
  async readExtras() { return (await this.redis.get<Record<string, string[]>>(digKeys.extras)) ?? {}; }
  async writeExtras(e: Record<string, string[]>) { await this.redis.set(digKeys.extras, e); }
  async readAdjudicated() { return (await this.redis.get<string[]>(digKeys.adjudicated)) ?? []; }
  async writeAdjudicated(list: string[]) { await this.redis.set(digKeys.adjudicated, list); }
  async readLog(kind: "rej" | "claim", date: string, index: number) {
    const key = kind === "rej" ? digKeys.rejected(date, index) : digKeys.claims(date, index);
    const h = (await this.redis.hgetall<Record<string, unknown>>(key)) ?? {};
    return Object.fromEntries(Object.entries(h).map(([k, v]) => [k, Number(v) || 0]));
  }
  async readHeartbeat() { return (await this.redis.get<string>(digKeys.heartbeat)) ?? null; }
}
