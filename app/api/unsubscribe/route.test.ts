import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({ removeSubscriber: vi.fn(async () => undefined) }));

const { GET, POST } = await import("./route");
const { removeSubscriber } = await import("@/lib/db");
const { signUnsubscribeToken, unsubscribeSecret } = await import("@/lib/unsubscribeToken");

const token = () => signUnsubscribeToken("sam@example.com", unsubscribeSecret()!);
const url = (t: string) => `http://localhost/api/unsubscribe?token=${encodeURIComponent(t)}`;

function oneClick(t: string) {
  return new NextRequest(url(t), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "List-Unsubscribe=One-Click",
  });
}

function formPost(t: string) {
  // The confirm page's <form> has no fields: the token rides in its action URL.
  return new NextRequest(url(t), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "",
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/unsubscribe", () => {
  it("never unsubscribes: it sends a valid link to the confirm page", async () => {
    const t = token();
    const res = GET(new NextRequest(url(t)));
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/unsubscribe");
    expect(location.searchParams.get("token")).toBe(t);
    expect(removeSubscriber).not.toHaveBeenCalled();
  });

  it("never unsubscribes on a forged or legacy token either", async () => {
    GET(new NextRequest(url(Buffer.from("sam@example.com").toString("base64url"))));
    expect(removeSubscriber).not.toHaveBeenCalled();
  });

  it("sends a missing token straight to the failure page", async () => {
    const res = GET(new NextRequest("http://localhost/api/unsubscribe"));
    expect(res.headers.get("location")).toBe("http://localhost/unsubscribed?ok=0");
  });
});

describe("POST /api/unsubscribe", () => {
  it("RFC 8058 one-click: a valid token unsubscribes and returns 200", async () => {
    const res = await POST(oneClick(token()));
    expect(res.status).toBe(200);
    expect(removeSubscriber).toHaveBeenCalledWith("sam@example.com");
  });

  it("one-click with a tampered token changes nothing and returns 400", async () => {
    const res = await POST(oneClick(token().slice(0, -2) + "xx"));
    expect(res.status).toBe(400);
    expect(removeSubscriber).not.toHaveBeenCalled();
  });

  it("confirm-page form: a valid token unsubscribes and redirects (303) to ok=1", async () => {
    const res = await POST(formPost(token()));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost/unsubscribed?ok=1");
    expect(removeSubscriber).toHaveBeenCalledWith("sam@example.com");
  });

  it("confirm-page form: a tampered token changes nothing and redirects to ok=0", async () => {
    const res = await POST(formPost(token().slice(0, -2) + "xx"));
    expect(res.headers.get("location")).toBe("http://localhost/unsubscribed?ok=0");
    expect(removeSubscriber).not.toHaveBeenCalled();
  });

  it("is idempotent: an address that's already gone still counts as success", async () => {
    await POST(oneClick(token()));
    const res = await POST(oneClick(token()));
    expect(res.status).toBe(200);
  });

  it("rejects every token when the secret is missing in production", async () => {
    const t = token();
    vi.stubEnv("UNSUBSCRIBE_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    try {
      const res = await POST(oneClick(t));
      expect(res.status).toBe(400);
      expect(removeSubscriber).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
