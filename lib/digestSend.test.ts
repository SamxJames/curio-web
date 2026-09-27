import { describe, expect, it, vi } from "vitest";
import {
  BATCH_SIZE,
  MAX_RETRIES,
  chunk,
  redactAddresses,
  retryDelayMs,
  sendInBatches,
  type BatchResult,
  type SendBatch,
} from "./digestSend";

type Msg = { to: string };
const messages = (n: number): Msg[] => Array.from({ length: n }, (_, i) => ({ to: `r${i}@example.com` }));

const ok = (c: Msg[], errors: { index: number; message: string }[] = []): BatchResult => ({
  data: { data: c.map((_, i) => ({ id: `id-${i}` })), errors },
  error: null,
  headers: {},
});
const fail = (name: string, statusCode: number | null, headers: Record<string, string> = {}): BatchResult => ({
  data: null,
  error: { name, statusCode, message: `${name} happened` },
  headers,
});

const noSleep = () => vi.fn(async () => {});

describe("chunk", () => {
  it("never exceeds the batch maximum of 100", () => {
    expect(BATCH_SIZE).toBe(100);
  });
});

describe("sendInBatches: chunking", () => {
  it.each([
    [0, []],
    [1, [1]],
    [100, [100]],
    [101, [100, 1]],
    [250, [100, 100, 50]],
  ])("%i subscribers → batches of %j, sent one at a time, in order", async (n, sizes) => {
    let inFlight = 0;
    let maxInFlight = 0;
    const sendBatch: SendBatch<Msg> = vi.fn(async (c) => {
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return ok(c);
    });
    const all = messages(n);

    const out = await sendInBatches(all, { sendBatch, keyPrefix: "run", sleep: noSleep() });

    const calls = vi.mocked(sendBatch).mock.calls;
    expect(calls.map(([c]) => c.length)).toEqual(sizes);
    expect(calls.flatMap(([c]) => c)).toEqual(all);
    expect(calls.map(([, key]) => key)).toEqual(sizes.map((_, i) => `run-${i}`));
    expect(maxInFlight).toBeLessThanOrEqual(1);
    expect(out).toEqual({ attempted: n, sent: n, failed: 0, errors: [], failedRecipients: [] });
  });

  it("splits with chunk() the same way", () => {
    expect(chunk(messages(250)).map((c) => c.length)).toEqual([100, 100, 50]);
    expect(chunk([])).toEqual([]);
  });
});

describe("sendInBatches: retries", () => {
  it("retries a 429 after the retry-after delay, then succeeds, reusing the idempotency key", async () => {
    const sendBatch = vi
      .fn<SendBatch<Msg>>()
      .mockResolvedValueOnce(fail("rate_limit_exceeded", 429, { "retry-after": "2" }))
      .mockImplementation(async (c) => ok(c));
    const sleep = noSleep();

    const out = await sendInBatches(messages(3), { sendBatch, keyPrefix: "run", sleep });

    expect(sleep).toHaveBeenCalledWith(2000);
    expect(sendBatch.mock.calls.map(([, key]) => key)).toEqual(["run-0", "run-0"]);
    expect(out).toMatchObject({ attempted: 3, sent: 3, failed: 0 });
  });

  it("backs off exponentially (1s, 2s, 4s) without retry-after, and retries 5xx", async () => {
    const sendBatch = vi
      .fn<SendBatch<Msg>>()
      .mockResolvedValueOnce(fail("internal_server_error", 500))
      .mockResolvedValueOnce(fail("application_error", 502))
      .mockResolvedValueOnce(fail("application_error", null)) // network failure
      .mockImplementation(async (c) => ok(c));
    const sleep = noSleep();

    const out = await sendInBatches(messages(1), { sendBatch, keyPrefix: "run", sleep });

    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 4000]);
    expect(out.sent).toBe(1);
  });

  it("gives up after MAX_RETRIES and counts the whole chunk failed, then carries on with the next chunk", async () => {
    let call = 0;
    const sendBatch = vi.fn<SendBatch<Msg>>(async (c) =>
      c.length === 100 ? (call++, fail("rate_limit_exceeded", 429)) : ok(c)
    );

    const out = await sendInBatches(messages(101), { sendBatch, keyPrefix: "run", sleep: noSleep() });

    expect(MAX_RETRIES).toBe(3);
    expect(call).toBe(MAX_RETRIES + 1);
    expect(out.sent).toBe(1);
    expect(out.failed).toBe(100);
    expect(out.failedRecipients).toEqual(messages(100).map((m) => m.to));
    expect(out.errors).toEqual(["rate_limit_exceeded: rate_limit_exceeded happened"]);
  });

  it.each([
    ["validation_error", 422],
    ["daily_quota_exceeded", 429],
    ["monthly_quota_exceeded", 429],
    ["invalid_api_key", 403],
  ])("doesn't retry %s (%i)", async (name, status) => {
    const sendBatch = vi.fn<SendBatch<Msg>>(async () => fail(name, status));
    const out = await sendInBatches(messages(2), { sendBatch, keyPrefix: "run", sleep: noSleep() });
    expect(sendBatch).toHaveBeenCalledTimes(1);
    expect(out.failed).toBe(2);
  });

  it("treats a thrown error like a network failure and retries it", async () => {
    const sendBatch = vi
      .fn<SendBatch<Msg>>()
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockImplementation(async (c) => ok(c));
    const out = await sendInBatches(messages(1), { sendBatch, keyPrefix: "run", sleep: noSleep() });
    expect(out.sent).toBe(1);
  });

  it("gives up rather than retrying early when retry-after is longer than the cap", async () => {
    const sendBatch = vi.fn<SendBatch<Msg>>(async () => fail("rate_limit_exceeded", 429, { "retry-after": "120" }));
    const sleep = noSleep();
    const out = await sendInBatches(messages(1), { sendBatch, keyPrefix: "run", sleep });
    expect(sleep).not.toHaveBeenCalled();
    expect(out.failed).toBe(1);
  });

  it("won't wait past the deadline, and won't start a chunk after it", async () => {
    let t = 0;
    const sendBatch = vi.fn<SendBatch<Msg>>(async () => {
      t += 1_000;
      return fail("rate_limit_exceeded", 429, { "retry-after": "5" });
    });
    const out = await sendInBatches(messages(150), {
      sendBatch,
      keyPrefix: "run",
      sleep: noSleep(),
      now: () => t,
      deadline: 1_000,
    });
    expect(sendBatch).toHaveBeenCalledTimes(1); // retry-after 5s would pass the deadline
    expect(out.failed).toBe(150); // and chunk 2 never starts
  });
});

describe("sendInBatches: per-email rejections (permissive batch validation)", () => {
  it("counts only the rejected emails as failed and never logs their addresses", async () => {
    const sendBatch = vi.fn<SendBatch<Msg>>(async (c) =>
      ok(c, [{ index: 1, message: "Invalid `to` field: r1@example.com" }])
    );
    const out = await sendInBatches(messages(3), { sendBatch, keyPrefix: "run", sleep: noSleep() });
    expect(out).toMatchObject({ attempted: 3, sent: 2, failed: 1, failedRecipients: ["r1@example.com"] });
    expect(out.errors.join(" ")).not.toContain("@");
  });
});

describe("sendInBatches: onSent (Amendment 2)", () => {
  it("reports each accepted chunk's recipients as soon as it succeeds, excluding rejected and failed ones", async () => {
    const order: string[] = [];
    const sendBatch = vi.fn<SendBatch<Msg>>(async (c) => {
      order.push(`send:${c.length}`);
      if (c.length === 50) return fail("validation_error", 422);
      return ok(c, [{ index: 0, message: "bad" }]);
    });
    const onSent = vi.fn(async (r: string[]) => {
      order.push(`onSent:${r.length}`);
    });

    await sendInBatches(messages(250), { sendBatch, keyPrefix: "run", sleep: noSleep(), onSent });

    expect(order).toEqual(["send:100", "onSent:99", "send:100", "onSent:99", "send:50"]);
    expect(onSent.mock.calls[0][0]).toEqual(messages(100).slice(1).map((m) => m.to));
  });

  it("keeps going, and still counts the chunk sent, if onSent throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await sendInBatches(messages(101), {
      sendBatch: async (c) => ok(c),
      keyPrefix: "run",
      sleep: noSleep(),
      onSent: async () => {
        throw new Error("redis down for x@example.com");
      },
    });
    const logged = error.mock.calls.flat().map(String).join(" ");
    error.mockRestore();
    expect(out.sent).toBe(101);
    expect(logged).not.toContain("@example.com");
  });
});

describe("retryDelayMs", () => {
  it("honours retry-after seconds", () => expect(retryDelayMs({ "retry-after": "3" }, 0, 0)).toBe(3000));
  it("honours an HTTP-date retry-after", () =>
    expect(retryDelayMs({ "retry-after": new Date(10_000).toUTCString() }, 0, 4_000)).toBe(6000));
  it("falls back to 1s, 2s, 4s", () => expect([0, 1, 2].map((a) => retryDelayMs(null, a, 0))).toEqual([1000, 2000, 4000]));
  it("returns null past the 30s cap", () => expect(retryDelayMs({ "retry-after": "31" }, 0, 0)).toBeNull());
});

describe("redactAddresses", () => {
  it("replaces anything address-shaped", () => {
    expect(redactAddresses("bad: a.b+c@x.co, <d@e.org>")).toBe("bad: [address], <[address]>");
  });
});
