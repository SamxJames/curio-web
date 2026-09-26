import { vi, describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const sharedWord = { slug: "custard", word: "custard" };

vi.mock("@/lib/words", () => ({ resolveTodayWord: vi.fn(async () => sharedWord) }));
vi.mock("@/lib/db", () => ({
  // An anonymous subscriber and one whose address also has an account —
  // both must get the same word.
  getAllSubscribers: vi.fn(async () => ["anon@example.com", "account-holder@example.com"]),
}));
vi.mock("@/lib/email", () => ({ sendDailyDigest: vi.fn(async () => undefined) }));
vi.mock("@/lib/bluesky", () => ({ postDailyWordToBluesky: vi.fn(async () => ({ posted: true })) }));

const { GET } = await import("./route");
const { resolveTodayWord } = await import("@/lib/words");
const { sendDailyDigest } = await import("@/lib/email");
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

    expect(sendDailyDigest).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(sendDailyDigest).mock.calls) expect(call[1]).toBe(sharedWord);
    expect(vi.mocked(postDailyWordToBluesky).mock.calls[0][0]).toBe(sharedWord);
    expect(body).toEqual({ word: "custard", attempted: 2, sent: 2, failed: 0, bluesky: true });
  });

  it("resolves the word and dates every send from one instant", async () => {
    await GET(cronRequest());
    const now = vi.mocked(resolveTodayWord).mock.calls[0][0];
    for (const call of vi.mocked(sendDailyDigest).mock.calls) expect(call[2]).toBe(now);
    expect(vi.mocked(postDailyWordToBluesky).mock.calls[0][1]).toBe(now);
  });

  it("rejects a request without the cron secret", async () => {
    const res = await GET(new NextRequest("http://localhost/api/cron/send-daily"));
    expect(res.status).toBe(401);
    expect(sendDailyDigest).not.toHaveBeenCalled();
  });
});
