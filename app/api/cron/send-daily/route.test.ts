import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { fake } = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  return {
    fake: {
      store,
      set: vi.fn(async (k: string, v: string, o?: { nx?: boolean; ex?: number }) => {
        if (o?.nx && store.has(k)) return null;
        store.set(k, v);
        return "OK";
      }),
      del: vi.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
      sadd: vi.fn(async (k: string, ...members: string[]) => {
        const s = (store.get(k) as Set<string>) ?? new Set<string>();
        members.forEach((m) => s.add(m));
        store.set(k, s);
        return members.length;
      }),
      srem: vi.fn(async (k: string, ...members: string[]) => {
        const s = store.get(k) as Set<string> | undefined;
        let n = 0;
        members.forEach((m) => (n += s?.delete(m) ? 1 : 0));
        return n;
      }),
      smembers: vi.fn(async (k: string) => [...((store.get(k) as Set<string>) ?? [])]),
      expire: vi.fn(async () => 1),
    },
  };
});

vi.mock("@/lib/redis", () => ({ redis: fake, usingUpstash: true }));
vi.mock("@/lib/words", () => ({ resolveTodayWord: vi.fn(async () => ({ slug: "custard", word: "custard" })) }));
vi.mock("@/lib/db", () => ({
  getAllSubscribers: vi.fn(async () => ["anon@example.com", "account-holder@example.com"]),
}));
vi.mock("@/lib/email", () => ({
  sendDailyDigests: vi.fn(
    async (emails: string[], _w: unknown, _d: Date, opts: { onSent?: (r: string[]) => Promise<void> }) => {
      if (emails.length > 0) await opts.onSent?.(emails);
      return { attempted: emails.length, sent: emails.length, failed: 0, errors: [], failedRecipients: [] };
    }
  ),
}));
vi.mock("@/lib/bluesky", () => ({ postDailyWordToBluesky: vi.fn(async () => ({ posted: true })) }));

const { GET, maxDuration } = await import("./route");
const { getAllSubscribers } = await import("@/lib/db");
const { sendDailyDigests } = await import("@/lib/email");
const { postDailyWordToBluesky } = await import("@/lib/bluesky");

function cronRequest() {
  return new NextRequest("http://localhost/api/cron/send-daily", {
    headers: { authorization: "Bearer test-secret" },
  });
}

function cronRequestTo(query: string, auth = "Bearer test-secret") {
  return new NextRequest(`http://localhost/api/cron/send-daily${query}`, {
    headers: auth ? { authorization: auth } : {},
  });
}

async function failBothThisMorning() {
  vi.mocked(sendDailyDigests).mockResolvedValueOnce({
    attempted: 2, sent: 0, failed: 2, errors: ["rate_limit_exceeded: x"],
    failedRecipients: ["anon@example.com", "account-holder@example.com"],
  });
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await GET(cronRequest());
  error.mockRestore();
}

let log: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  fake.store.clear();
  process.env.CRON_SECRET = "test-secret";
  // The route logs its own success-path summary; keep test output pristine.
  log = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  log.mockRestore();
});

describe("GET /api/cron/send-daily", () => {
  it("sends every subscriber, account or not, the shared word — the same one Bluesky posts", async () => {
    const body = await (await GET(cronRequest())).json();

    expect(sendDailyDigests).toHaveBeenCalledTimes(1);
    const [recipients] = vi.mocked(sendDailyDigests).mock.calls[0];
    expect(recipients).toEqual(["anon@example.com", "account-holder@example.com"]);
    expect(body).toEqual({
      word: "custard", attempted: 2, sent: 2, failed: 0, bluesky: true,
      alreadyRan: { email: false, bluesky: false },
    });
  });

  it("rejects a request without the cron secret", async () => {
    const res = await GET(new NextRequest("http://localhost/api/cron/send-daily"));
    expect(res.status).toBe(401);
    expect(sendDailyDigests).not.toHaveBeenCalled();
  });

  it("fails closed in production without UNSUBSCRIBE_SECRET: nothing sent, nothing posted", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UNSUBSCRIBE_SECRET", "");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await GET(cronRequest());
      expect(res.status).toBe(500);
      expect(sendDailyDigests).not.toHaveBeenCalled();
      expect(postDailyWordToBluesky).not.toHaveBeenCalled();
      expect(error.mock.calls.flat().join(" ")).toContain("UNSUBSCRIBE_SECRET");
    } finally {
      error.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it("logs the failure count and messages, never addresses", async () => {
    vi.mocked(sendDailyDigests).mockResolvedValueOnce({
      attempted: 2, sent: 1, failed: 1,
      errors: ["rate_limit_exceeded: Too many requests"],
      failedRecipients: ["account-holder@example.com"],
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const body = await (await GET(cronRequest())).json();
    const logged = error.mock.calls.flat().map(String).join(" ");
    error.mockRestore();

    expect(body).toMatchObject({ attempted: 2, sent: 1, failed: 1 });
    expect(logged).toContain("1 of 2");
    expect(logged).toContain("rate_limit_exceeded");
    expect(logged).not.toContain("@example.com");
  });

  it("counts every subscriber failed if the whole send rejects", async () => {
    vi.mocked(sendDailyDigests).mockRejectedValueOnce(new Error("boom"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const body = await (await GET(cronRequest())).json();
    error.mockRestore();
    expect(body).toMatchObject({ attempted: 2, sent: 0, failed: 2 });
  });

  it("pins maxDuration to the Hobby plan's ceiling", () => {
    expect(maxDuration).toBe(300);
  });

  it("a second run the same UTC day is a no-op on both channels", async () => {
    await GET(cronRequest());
    const body = await (await GET(cronRequest())).json();

    expect(sendDailyDigests).toHaveBeenCalledTimes(1);
    expect(postDailyWordToBluesky).toHaveBeenCalledTimes(1);
    expect(body).toEqual({
      word: "custard", attempted: 0, sent: 0, failed: 0, bluesky: false,
      alreadyRan: { email: true, bluesky: true },
    });
  });

  it("?force=1 re-sends email only — no second Bluesky post — under a fresh idempotency key", async () => {
    await GET(cronRequest());
    const body = await (await GET(cronRequestTo("?force=1"))).json();

    expect(sendDailyDigests).toHaveBeenCalledTimes(2);
    expect(postDailyWordToBluesky).toHaveBeenCalledTimes(1);
    const [first, second] = vi.mocked(sendDailyDigests).mock.calls.map((c) => c[3].runKey);
    expect(second).not.toBe(first);
    expect(body).toMatchObject({ attempted: 2, sent: 2, bluesky: false, alreadyRan: { email: false, bluesky: true } });
  });

  it("?force=1&bluesky=1 re-sends and re-posts", async () => {
    await GET(cronRequest());
    const body = await (await GET(cronRequestTo("?force=1&bluesky=1"))).json();

    expect(sendDailyDigests).toHaveBeenCalledTimes(2);
    expect(postDailyWordToBluesky).toHaveBeenCalledTimes(2);
    expect(body).toMatchObject({ sent: 2, bluesky: true, alreadyRan: { email: false, bluesky: false } });
  });

  it("?force=1 still makes today's first Bluesky post if there hasn't been one", async () => {
    const body = await (await GET(cronRequestTo("?force=1"))).json();
    expect(postDailyWordToBluesky).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({ bluesky: true, alreadyRan: { email: false, bluesky: false } });
  });

  it.each(["?bluesky=1", "?resend=failed&bluesky=1", "?force=1&resend=failed"])(
    "rejects the malformed override %s with 400 and sends nothing",
    async (query) => {
      const res = await GET(cronRequestTo(query));
      expect(res.status).toBe(400);
      expect(sendDailyDigests).not.toHaveBeenCalled();
      expect(postDailyWordToBluesky).not.toHaveBeenCalled();
    }
  );

  it("?force=1 without the right secret is refused and sends nothing", async () => {
    await GET(cronRequest());
    vi.clearAllMocks();
    expect((await GET(cronRequestTo("?force=1", ""))).status).toBe(401);
    expect((await GET(cronRequestTo("?force=1&bluesky=1", "Bearer wrong"))).status).toBe(401);
    expect(sendDailyDigests).not.toHaveBeenCalled();
    expect(postDailyWordToBluesky).not.toHaveBeenCalled();
  });

  it("?force=1 and ?resend=failed are refused when no CRON_SECRET is configured at all (local dev)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    try {
      expect((await GET(cronRequestTo("?force=1", ""))).status).toBe(401);
      expect((await GET(cronRequestTo("?resend=failed", ""))).status).toBe(401);
      expect(sendDailyDigests).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("?resend=failed sends only to recorded failures who are still subscribed, and never posts", async () => {
    await failBothThisMorning();
    vi.mocked(getAllSubscribers).mockResolvedValueOnce(["account-holder@example.com"]); // anon unsubscribed since

    const body = await (await GET(cronRequestTo("?resend=failed"))).json();

    expect(vi.mocked(sendDailyDigests).mock.calls[1][0]).toEqual(["account-holder@example.com"]);
    expect(postDailyWordToBluesky).toHaveBeenCalledTimes(1); // this morning's only
    expect(body).toMatchObject({ attempted: 1, sent: 1, failed: 0, bluesky: false, alreadyRan: { email: false, bluesky: false } });
  });

  it("a second ?resend=failed never double-sends: successes leave the set as they happen", async () => {
    await failBothThisMorning();
    await GET(cronRequestTo("?resend=failed"));
    await GET(cronRequestTo("?resend=failed"));

    expect(vi.mocked(sendDailyDigests).mock.calls[1][0].sort()).toEqual(["account-holder@example.com", "anon@example.com"]);
    expect(vi.mocked(sendDailyDigests).mock.calls[2][0]).toEqual([]);
  });

  it("a ?resend=failed that dies partway leaves only the unsent addresses for the next one", async () => {
    await failBothThisMorning();
    vi.mocked(sendDailyDigests).mockImplementationOnce(async (emails, _w, _d, opts) => {
      await opts.onSent?.([emails[0]]); // first chunk went out…
      throw new Error("function killed"); // …then the run died
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await GET(cronRequestTo("?resend=failed"));
    error.mockRestore();
    const firstResend = vi.mocked(sendDailyDigests).mock.calls[1][0];

    await GET(cronRequestTo("?resend=failed"));

    expect(vi.mocked(sendDailyDigests).mock.calls[2][0]).toEqual([firstResend[1]]);
  });

  it("the fail-closed refusal claims no lock, so the next run after the fix sends normally", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UNSUBSCRIBE_SECRET", "");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await GET(cronRequest());
    error.mockRestore();
    vi.stubEnv("UNSUBSCRIBE_SECRET", "now-set");
    try {
      const body = await (await GET(cronRequest())).json();
      expect(body).toMatchObject({ attempted: 2, sent: 2, bluesky: true, alreadyRan: { email: false, bluesky: false } });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
