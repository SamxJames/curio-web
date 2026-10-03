import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  getSubscriberByEmail: vi.fn(async () => null),
  upsertSubscriber: vi.fn(async () => undefined),
}));
vi.mock("@/lib/trafficStats", () => ({ recordTrafficEvent: vi.fn(async () => undefined) }));

const { POST } = await import("./route");
const { getSubscriberByEmail, upsertSubscriber } = await import("@/lib/db");
const { recordTrafficEvent } = await import("@/lib/trafficStats");
const { signConfirmToken } = await import("@/lib/confirmToken");
const { unsubscribeSecret } = await import("@/lib/unsubscribeToken");

const confirm = (token: string) =>
  new NextRequest(`http://localhost/api/subscribe/confirm?token=${encodeURIComponent(token)}`, { method: "POST" });
const location = (res: Response) => new URL(res.headers.get("location")!);

beforeEach(() => vi.clearAllMocks());

describe("POST /api/subscribe/confirm", () => {
  it("adds a new subscriber, counts a signup against the token's source, 303s to ok=1", async () => {
    const res = await POST(confirm(signConfirmToken("a@example.com", "reddit", unsubscribeSecret()!)));
    expect(res.status).toBe(303);
    expect(location(res).pathname).toBe("/subscribed");
    expect(location(res).searchParams.get("ok")).toBe("1");
    expect(upsertSubscriber).toHaveBeenCalledWith("a@example.com");
    expect(recordTrafficEvent).toHaveBeenCalledWith({ kind: "signup", source: "reddit" });
  });

  it("is idempotent: an existing subscriber is left alone, not re-counted, still ok=1", async () => {
    vi.mocked(getSubscriberByEmail).mockResolvedValueOnce({ email: "a@example.com", hour: 9, createdAt: "2026-09-01T00:00:00Z" });
    const res = await POST(confirm(signConfirmToken("a@example.com", "direct", unsubscribeSecret()!)));
    expect(location(res).searchParams.get("ok")).toBe("1");
    expect(upsertSubscriber).not.toHaveBeenCalled();
    expect(recordTrafficEvent).not.toHaveBeenCalled();
  });

  it("rejects a bad or expired token: ok=0, nothing stored", async () => {
    const old = signConfirmToken("a@example.com", "direct", unsubscribeSecret()!, new Date("2020-01-01T00:00:00Z"));
    for (const t of ["garbage", old]) {
      const res = await POST(confirm(t));
      expect(location(res).searchParams.get("ok")).toBe("0");
    }
    expect(upsertSubscriber).not.toHaveBeenCalled();
  });

  it("reports ok=0 when storing fails", async () => {
    vi.mocked(upsertSubscriber).mockRejectedValueOnce(new Error("upstash down"));
    const res = await POST(confirm(signConfirmToken("a@example.com", "direct", unsubscribeSecret()!)));
    expect(location(res).searchParams.get("ok")).toBe("0");
  });

  it("still confirms when counting throws", async () => {
    vi.mocked(recordTrafficEvent).mockRejectedValueOnce(new Error("upstash down"));
    const res = await POST(confirm(signConfirmToken("a@example.com", "direct", unsubscribeSecret()!)));
    expect(location(res).searchParams.get("ok")).toBe("1");
  });
});
