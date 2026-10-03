import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  getSubscriberByEmail: vi.fn(async () => null),
  upsertSubscriber: vi.fn(async () => undefined),
}));
vi.mock("@/lib/trafficStats", () => ({ recordTrafficEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/confirmCooldown", () => ({
  claimConfirmSend: vi.fn(async () => true),
  releaseConfirmSend: vi.fn(async () => undefined),
}));
vi.mock("@/lib/email", () => ({
  confirmUrl: vi.fn(() => "https://curioword.com/subscribe/confirm?token=t&utm_source=email"),
  sendConfirmEmail: vi.fn(async () => undefined),
}));

const { POST } = await import("./route");
const { getSubscriberByEmail, upsertSubscriber } = await import("@/lib/db");
const { recordTrafficEvent } = await import("@/lib/trafficStats");
const { claimConfirmSend, releaseConfirmSend } = await import("@/lib/confirmCooldown");
const { confirmUrl, sendConfirmEmail } = await import("@/lib/email");

const post = (body: unknown) =>
  new NextRequest("http://localhost/api/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/subscribe (double opt-in)", () => {
  it("emails a confirm link for a new address, stores nothing, counts a request", async () => {
    const res = await POST(post({ email: " Sam@Example.com ", source: "search" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, pending: true });
    expect(confirmUrl).toHaveBeenCalledWith("sam@example.com", "search", expect.any(String));
    expect(sendConfirmEmail).toHaveBeenCalledWith("sam@example.com", expect.stringContaining("/subscribe/confirm"));
    expect(upsertSubscriber).not.toHaveBeenCalled();
    expect(recordTrafficEvent).toHaveBeenCalledWith({ kind: "request", source: "search" });
  });

  it("files a missing or unknown source as direct", async () => {
    await POST(post({ email: "a@example.com", source: "myspace" }));
    expect(confirmUrl).toHaveBeenCalledWith("a@example.com", "direct", expect.any(String));
  });

  it("gives an existing subscriber the same reply but sends and counts nothing", async () => {
    vi.mocked(getSubscriberByEmail).mockResolvedValueOnce({ email: "a@example.com", hour: 9, createdAt: "2026-09-01T00:00:00Z" });
    const res = await POST(post({ email: "a@example.com" }));
    expect(await res.json()).toEqual({ ok: true, pending: true });
    expect(sendConfirmEmail).not.toHaveBeenCalled();
    expect(recordTrafficEvent).not.toHaveBeenCalled();
  });

  it("gives a cooled-down address the same reply but sends nothing", async () => {
    vi.mocked(claimConfirmSend).mockResolvedValueOnce(false);
    const res = await POST(post({ email: "a@example.com" }));
    expect(await res.json()).toEqual({ ok: true, pending: true });
    expect(sendConfirmEmail).not.toHaveBeenCalled();
  });

  it("returns a friendly JSON 500 and sends nothing when the subscriber lookup throws", async () => {
    vi.mocked(getSubscriberByEmail).mockRejectedValueOnce(new Error("redis down"));
    const res = await POST(post({ email: "a@example.com" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Something went wrong on our side. Please try again in a few minutes." });
    expect(sendConfirmEmail).not.toHaveBeenCalled();
  });

  it("returns a friendly JSON 500 and sends nothing when the cooldown claim throws", async () => {
    vi.mocked(claimConfirmSend).mockRejectedValueOnce(new Error("redis down"));
    const res = await POST(post({ email: "a@example.com" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Something went wrong on our side. Please try again in a few minutes." });
    expect(sendConfirmEmail).not.toHaveBeenCalled();
  });

  it("returns 502 and releases the cooldown when the send fails", async () => {
    vi.mocked(sendConfirmEmail).mockRejectedValueOnce(new Error("Resend send failed: x"));
    const res = await POST(post({ email: "a@example.com" }));
    expect(res.status).toBe(502);
    expect(releaseConfirmSend).toHaveBeenCalledWith("a@example.com");
    expect(recordTrafficEvent).not.toHaveBeenCalled();
  });

  it("still succeeds when counting the request throws", async () => {
    vi.mocked(recordTrafficEvent).mockRejectedValueOnce(new Error("upstash down"));
    const res = await POST(post({ email: "a@example.com" }));
    expect(res.status).toBe(200);
  });

  it("rejects an invalid email with 400 and does nothing else", async () => {
    const res = await POST(post({ email: "nope" }));
    expect(res.status).toBe(400);
    expect(sendConfirmEmail).not.toHaveBeenCalled();
  });

  it("rejects a non-string email with 400 instead of throwing", async () => {
    for (const email of [123, ["a@b.co"], {}]) {
      const res = await POST(post({ email }));
      expect(res.status).toBe(400);
    }
    expect(sendConfirmEmail).not.toHaveBeenCalled();
  });

  it("fails closed with 503 in production without UNSUBSCRIBE_SECRET", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UNSUBSCRIBE_SECRET", "");
    const res = await POST(post({ email: "a@example.com" }));
    expect(res.status).toBe(503);
    expect(sendConfirmEmail).not.toHaveBeenCalled();
  });
});
