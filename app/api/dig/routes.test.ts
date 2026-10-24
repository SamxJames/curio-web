import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dig/server", () => ({
  readDay: vi.fn(async (date: string) => (date === "2026-12-09" || date === "2026-12-10" ? { v: 1, date, rejSample: 1, prompts: [] } : null)),
  recordFunnel: vi.fn(async () => {}),
  recordFinish: vi.fn(async () => ({ "39": 4 })),
  recordClaim: vi.fn(async () => {}),
}));
import * as server from "@/lib/dig/server";
import { GET as today } from "./today/route";
import { GET as pastDay } from "./day/[date]/route";
import { POST as event } from "./event/route";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-12-10T23:00:00Z"));
  vi.stubEnv("DIG_LAUNCH_DATE", "2026-12-01");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

const ctx = (date: string) => ({ params: Promise.resolve({ date }) }) as never;
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest("http://localhost/api/dig/event", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0", ...headers },
  });

describe("/api/dig/today", () => {
  it("serves today with its number, cached until 00:00 UTC", async () => {
    const res = await today();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ date: "2026-12-10", number: 10 });
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=3600");
  });
  it("is closed before launch and 503s with no-store when the day is missing", async () => {
    vi.stubEnv("DIG_LAUNCH_DATE", "2026-12-20");
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await today()).status).toBe(404);
    vi.stubEnv("DIG_LAUNCH_DATE", "2026-12-01");
    vi.setSystemTime(new Date("2026-12-11T01:00:00Z"));
    const res = await today();
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("/api/dig/day/[date]", () => {
  it("serves only launched past days", async () => {
    const ok = await pastDay(new NextRequest("http://localhost"), ctx("2026-12-09"));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toContain("s-maxage=86400");
    for (const d of ["2026-12-10", "2026-12-11", "2026-11-30", "nope"]) {
      const res = await pastDay(new NextRequest("http://localhost"), ctx(d));
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });
});

describe("/api/dig/event", () => {
  it("counts allowlisted events and returns the spread on finish", async () => {
    expect((await event(post({ kind: "start", date: "2026-12-10" }))).status).toBe(204);
    expect(server.recordFunnel).toHaveBeenCalledWith("2026-12-10", { kind: "start", date: "2026-12-10" });
    const res = await event(post({ kind: "finish", date: "2026-12-10", score: 390, tiers: ["fossil", "fossil", "fossil", "uncommon", "familiar", null, null], rejected: [] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ spread: { "39": 4 } });
  });
  it("applies the /api/traffic safeguards", async () => {
    expect((await event(new NextRequest("http://localhost/api/dig/event", { method: "POST", body: "x", headers: { "content-type": "text/plain" } }))).status).toBe(415);
    expect((await event(post({ kind: "story" }, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await event(post({ kind: "nope" }))).status).toBe(400);
    expect((await event(post({ kind: "story" }, { "user-agent": "Googlebot" }))).status).toBe(204);
    expect(server.recordFunnel).not.toHaveBeenCalled();
  });
  it("returns 404 with no-store on all three routes before launch in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("DIG_LAUNCH_DATE", undefined as unknown as string);
    const results = [
      await today(),
      await pastDay(new NextRequest("http://localhost"), ctx("2026-12-09")),
      await event(post({ kind: "start", date: "2026-12-10" })),
    ];
    for (const res of results) {
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect(server.recordFunnel).not.toHaveBeenCalled();
  });
  it("returns 413 for a body over 4096 bytes", async () => {
    const big = JSON.stringify({ kind: "story", pad: "x".repeat(5000) });
    const res = await event(post(JSON.parse(big)));
    expect(res.status).toBe(413);
    expect(server.recordFunnel).not.toHaveBeenCalled();
  });
  it("passes a same-origin start event and counts it", async () => {
    const res = await event(post({ kind: "start", date: "2026-12-10" }, { "sec-fetch-site": "same-origin" }));
    expect(res.status).toBe(204);
    expect(server.recordFunnel).toHaveBeenCalledWith("2026-12-10", { kind: "start", date: "2026-12-10" });
  });
  it("rejects a finish for a past day with 400", async () => {
    const res = await event(post({ kind: "finish", date: "2026-12-09", score: 390, tiers: ["fossil", "fossil", "fossil", "uncommon", "familiar", null, null], rejected: [] }));
    expect(res.status).toBe(400);
    expect(server.recordFinish).not.toHaveBeenCalled();
  });
  it("sends a valid finish to recordFinish as the parsed event", async () => {
    await event(post({ kind: "finish", date: "2026-12-10", score: 390, tiers: ["fossil", "fossil", "fossil", "uncommon", "familiar", null, null], rejected: [[0, "ice cream"]] }));
    expect(server.recordFinish).toHaveBeenCalledWith({
      kind: "finish",
      date: "2026-12-10",
      score: 390,
      tiers: ["fossil", "fossil", "fossil", "uncommon", "familiar", null, null],
      rejected: [[0, "icecream"]],
    });
  });
  it("answers bots with 204 whatever the body holds", async () => {
    const big = JSON.stringify({ kind: "story", pad: "x".repeat(5000) });
    const res = await event(post(JSON.parse(big), { "user-agent": "Googlebot" }));
    expect(res.status).toBe(204);
    expect(server.recordFunnel).not.toHaveBeenCalled();
  });
});
