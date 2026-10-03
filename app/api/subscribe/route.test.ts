import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({ upsertSubscriber: vi.fn(async () => undefined) }));
vi.mock("@/lib/trafficStats", () => ({ recordTrafficEvent: vi.fn(async () => undefined) }));

const { POST } = await import("./route");
const { upsertSubscriber } = await import("@/lib/db");
const { recordTrafficEvent } = await import("@/lib/trafficStats");

const post = (body: unknown) =>
  new NextRequest("http://localhost/api/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/subscribe", () => {
  it("subscribes and records the signup against a valid source", async () => {
    const res = await POST(post({ email: "a@example.com", source: "search" }));
    expect(res.status).toBe(200);
    expect(upsertSubscriber).toHaveBeenCalledWith("a@example.com");
    expect(recordTrafficEvent).toHaveBeenCalledWith({ kind: "signup", source: "search" });
  });

  it("files a missing or unknown source under 'direct'", async () => {
    await POST(post({ email: "a@example.com" }));
    await POST(post({ email: "b@example.com", source: "myspace" }));
    expect(recordTrafficEvent).toHaveBeenNthCalledWith(1, { kind: "signup", source: "direct" });
    expect(recordTrafficEvent).toHaveBeenNthCalledWith(2, { kind: "signup", source: "direct" });
  });

  it("records nothing when the email is invalid", async () => {
    const res = await POST(post({ email: "nope", source: "search" }));
    expect(res.status).toBe(400);
    expect(recordTrafficEvent).not.toHaveBeenCalled();
  });

  it("still succeeds when recording throws", async () => {
    vi.mocked(recordTrafficEvent).mockRejectedValueOnce(new Error("upstash down"));
    const res = await POST(post({ email: "a@example.com", source: "share" }));
    expect(res.status).toBe(200);
  });
});
