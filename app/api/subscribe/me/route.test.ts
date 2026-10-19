import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const session: { current: unknown } = { current: null };
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session.current) }));
vi.mock("@/lib/db", () => ({
  getSubscriberByEmail: vi.fn(),
  upsertSubscriber: vi.fn(),
}));
vi.mock("@/lib/trafficStats", () => ({ recordTrafficEvent: vi.fn() }));

const { GET, POST } = await import("./route");
const { getSubscriberByEmail, upsertSubscriber } = await import("@/lib/db");
const { recordTrafficEvent } = await import("@/lib/trafficStats");

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest("http://localhost/api/subscribe/me", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getSubscriberByEmail).mockResolvedValue(null);
  vi.mocked(upsertSubscriber).mockResolvedValue(undefined);
  vi.mocked(recordTrafficEvent).mockResolvedValue(undefined);
  session.current = null;
});

describe("GET /api/subscribe/me", () => {
  it("401 when signed out", async () => {
    session.current = null;
    expect((await GET()).status).toBe(401);
  });
  it("reports subscribed for the session's address", async () => {
    session.current = { user: { email: "Sam@Example.com" } };
    vi.mocked(getSubscriberByEmail).mockResolvedValueOnce({ email: "sam@example.com" } as never);
    const res = await GET();
    expect(await res.json()).toEqual({ subscribed: true });
    expect(getSubscriberByEmail).toHaveBeenCalledWith("sam@example.com");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("500 JSON on a Redis error", async () => {
    session.current = { user: { email: "a@b.com" } };
    vi.mocked(getSubscriberByEmail).mockRejectedValueOnce(new Error("boom"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toHaveProperty("error");
  });
});

describe("POST /api/subscribe/me (one tap)", () => {
  it("401 when signed out and stores nothing", async () => {
    session.current = null;
    expect((await POST(post({ placement: "story" }))).status).toBe(401);
    expect(upsertSubscriber).not.toHaveBeenCalled();
  });
  it("subscribes the session's address, never one from the body, and counts it", async () => {
    session.current = { user: { email: "a@b.com" } };
    const res = await POST(post({ placement: "story", source: "search", email: "victim@x.com" }));
    expect(await res.json()).toEqual({ ok: true });
    expect(upsertSubscriber).toHaveBeenCalledWith("a@b.com");
    expect(recordTrafficEvent).toHaveBeenCalledWith({ kind: "signup", source: "search" });
    expect(recordTrafficEvent).toHaveBeenCalledWith({ kind: "signup-at", placement: "story" });
  });
  it("already subscribed: ok, not re-stored or re-counted", async () => {
    session.current = { user: { email: "a@b.com" } };
    vi.mocked(getSubscriberByEmail).mockResolvedValueOnce({ email: "a@b.com" } as never);
    expect((await POST(post({ placement: "story" }))).status).toBe(200);
    expect(upsertSubscriber).not.toHaveBeenCalled();
    expect(recordTrafficEvent).not.toHaveBeenCalled();
  });
  it("bad source becomes direct; bad placement isn't counted", async () => {
    session.current = { user: { email: "a@b.com" } };
    await POST(post({ placement: "popup", source: "nope" }));
    expect(recordTrafficEvent).toHaveBeenCalledWith({ kind: "signup", source: "direct" });
    expect(recordTrafficEvent).toHaveBeenCalledTimes(1);
  });
  it("a failed count doesn't fail the subscribe", async () => {
    session.current = { user: { email: "a@b.com" } };
    vi.mocked(recordTrafficEvent).mockRejectedValue(new Error("x"));
    expect((await POST(post({ placement: "story" }))).status).toBe(200);
  });
  it("500 JSON when the subscribe write fails", async () => {
    session.current = { user: { email: "a@b.com" } };
    vi.mocked(upsertSubscriber).mockRejectedValueOnce(new Error("boom"));
    expect((await POST(post({}))).status).toBe(500);
  });
  it("tolerates an empty/invalid body", async () => {
    session.current = { user: { email: "a@b.com" } };
    const req = new NextRequest("http://localhost/api/subscribe/me", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect((await POST(req)).status).toBe(200);
  });
  it("same-origin browser requests go through", async () => {
    session.current = { user: { email: "a@b.com" } };
    expect((await POST(post({}, { "sec-fetch-site": "same-origin" }))).status).toBe(200);
    expect(upsertSubscriber).toHaveBeenCalledWith("a@b.com");
  });
  it("403 no-store for a cross-site request, and nothing written", async () => {
    session.current = { user: { email: "a@b.com" } };
    const res = await POST(post({ placement: "story" }, { "sec-fetch-site": "cross-site" }));
    expect(res.status).toBe(403);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toHaveProperty("error");
    expect(upsertSubscriber).not.toHaveBeenCalled();
    expect(recordTrafficEvent).not.toHaveBeenCalled();
  });
  it("415 no-store for a non-JSON body (a CORS-simple form post), and nothing written", async () => {
    session.current = { user: { email: "a@b.com" } };
    const req = new NextRequest("http://localhost/api/subscribe/me", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(415);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(upsertSubscriber).not.toHaveBeenCalled();
    expect(recordTrafficEvent).not.toHaveBeenCalled();
  });
});
