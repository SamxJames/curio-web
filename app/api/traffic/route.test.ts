import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/trafficStats", () => ({ recordTrafficEvent: vi.fn(async () => undefined) }));

const { POST } = await import("./route");
const { recordTrafficEvent } = await import("@/lib/trafficStats");

const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

function post(body: unknown, ua: string | null = BROWSER) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (ua) headers["user-agent"] = ua;
  return new NextRequest("http://localhost/api/traffic", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/traffic", () => {
  it("records a valid event and returns 204", async () => {
    const res = await POST(post({ kind: "visit", source: "search" }));
    expect(res.status).toBe(204);
    expect(recordTrafficEvent).toHaveBeenCalledWith({ kind: "visit", source: "search" });
  });

  it("rejects an off-allowlist event with 400 and no write", async () => {
    const res = await POST(post({ kind: "visit", source: "myspace" }));
    expect(res.status).toBe(400);
    expect(recordTrafficEvent).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await POST(post("{nope"));
    expect(res.status).toBe(400);
    expect(recordTrafficEvent).not.toHaveBeenCalled();
  });

  it("quietly ignores bots: 204, no write", async () => {
    const res = await POST(post({ kind: "visit", source: "direct" }, "Googlebot/2.1"));
    expect(res.status).toBe(204);
    expect(recordTrafficEvent).not.toHaveBeenCalled();
  });

  it("still returns 204 when recording throws (analytics never errors the page)", async () => {
    vi.mocked(recordTrafficEvent).mockRejectedValueOnce(new Error("upstash down"));
    const res = await POST(post({ kind: "share", what: "story" }));
    expect(res.status).toBe(204);
  });
});
