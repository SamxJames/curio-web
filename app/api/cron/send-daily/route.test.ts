import { vi, describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const sharedWord = { slug: "custard", word: "custard" };

vi.mock("@/lib/words", () => ({ resolveTodayWord: vi.fn(async () => sharedWord) }));
vi.mock("@/lib/db", () => ({
  // An anonymous subscriber and one whose address also has an account —
  // both must get the same word.
  getAllSubscribers: vi.fn(async () => ["anon@example.com", "account-holder@example.com"]),
}));
vi.mock("@/lib/email", () => ({
  sendDailyDigests: vi.fn(async (emails: string[]) => ({
    attempted: emails.length, sent: emails.length, failed: 0, errors: [], failedRecipients: [],
  })),
}));
vi.mock("@/lib/bluesky", () => ({ postDailyWordToBluesky: vi.fn(async () => ({ posted: true })) }));

const { GET } = await import("./route");
const { resolveTodayWord } = await import("@/lib/words");
const { sendDailyDigests } = await import("@/lib/email");
const { postDailyWordToBluesky } = await import("@/lib/bluesky");

function cronRequest() {
  return new NextRequest("http://localhost/api/cron/send-daily", {
    headers: { authorization: "Bearer test-secret" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
});

describe("GET /api/cron/send-daily", () => {
  it("sends every subscriber, account or not, the shared word — the same one Bluesky posts", async () => {
    const body = await (await GET(cronRequest())).json();

    expect(sendDailyDigests).toHaveBeenCalledTimes(1);
    const [recipients, digestWord] = vi.mocked(sendDailyDigests).mock.calls[0];
    expect(recipients).toEqual(["anon@example.com", "account-holder@example.com"]);
    expect(digestWord).toBe(sharedWord);
    expect(vi.mocked(postDailyWordToBluesky).mock.calls[0][0]).toBe(sharedWord);
    expect(body).toEqual({ word: "custard", attempted: 2, sent: 2, failed: 0, bluesky: true });
  });

  it("resolves the word and dates every send from one instant", async () => {
    await GET(cronRequest());
    const now = vi.mocked(resolveTodayWord).mock.calls[0][0];
    expect(vi.mocked(sendDailyDigests).mock.calls[0][2]).toBe(now);
    expect(vi.mocked(postDailyWordToBluesky).mock.calls[0][1]).toBe(now);
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
});
