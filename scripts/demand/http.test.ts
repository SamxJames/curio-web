import { describe, expect, it, vi } from "vitest";
import { createFetcher, retryAfterMs, type FetchLike } from "./http";

function clock() {
  let t = 0;
  return {
    now: () => t,
    sleep: vi.fn(async (ms: number) => {
      t += ms;
    }),
  };
}

const res = (status: number, headers: Record<string, string> = {}) =>
  new Response("{}", { status, headers });

function sequence(...steps: (Response | Error)[]) {
  return vi.fn<FetchLike>(async () => {
    const next = steps.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  });
}

describe("createFetcher", () => {
  it("returns a successful response without waiting", async () => {
    const c = clock();
    const fetch = sequence(res(200));
    const response = await createFetcher({ fetch, ...c })("https://x.test/a");
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(c.sleep).not.toHaveBeenCalled();
  });

  it("does not retry a 404", async () => {
    const c = clock();
    const fetch = sequence(res(404));
    const response = await createFetcher({ fetch, ...c })("https://x.test/a");
    expect(response.status).toBe(404);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 with exponential backoff when there's no Retry-After", async () => {
    const c = clock();
    const fetch = sequence(res(429), res(503), res(200));
    const response = await createFetcher({ fetch, ...c })("https://x.test/a");
    expect(response.status).toBe(200);
    expect(c.sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000]);
  });

  it("honours Retry-After in seconds", async () => {
    const c = clock();
    const fetch = sequence(res(429, { "retry-after": "3" }), res(200));
    await createFetcher({ fetch, ...c })("https://x.test/a");
    expect(c.sleep).toHaveBeenCalledWith(3000);
  });

  it("gives up after the last attempt and returns the last retryable response", async () => {
    const c = clock();
    const fetch = sequence(res(500), res(500), res(500));
    const response = await createFetcher({ fetch, attempts: 3, ...c })("https://x.test/a");
    expect(response.status).toBe(500);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("retries network errors and rethrows after the last attempt", async () => {
    const c = clock();
    const fetch = sequence(new Error("socket hang up"), new Error("socket hang up"), new Error("socket hang up"));
    await expect(createFetcher({ fetch, attempts: 3, ...c })("https://x.test/a")).rejects.toThrow("socket hang up");
    expect(c.sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000]);
  });

  it("keeps a minimum gap between consecutive requests", async () => {
    const c = clock();
    const fetch = sequence(res(200), res(200));
    const fetcher = createFetcher({ fetch, minGapMs: 100, ...c });
    await fetcher("https://x.test/a");
    await fetcher("https://x.test/b");
    expect(c.sleep.mock.calls.map(([ms]) => ms)).toEqual([100]);
  });

  it("passes the URL and init through unchanged", async () => {
    const c = clock();
    const fetch = sequence(res(200));
    const init = { headers: { "User-Agent": "test" } };
    await createFetcher({ fetch, ...c })("https://x.test/a", init);
    expect(fetch).toHaveBeenCalledWith("https://x.test/a", init);
  });
});

describe("retryAfterMs", () => {
  it("reads seconds, HTTP dates, caps at 60s and ignores junk", () => {
    expect(retryAfterMs(null, 0)).toBeNull();
    expect(retryAfterMs("2", 0)).toBe(2000);
    expect(retryAfterMs("600", 0)).toBe(60_000);
    const now = Date.parse("Wed, 21 Oct 2015 07:28:00 GMT");
    expect(retryAfterMs("Wed, 21 Oct 2015 07:28:10 GMT", now)).toBe(10_000);
    expect(retryAfterMs("soon", 0)).toBeNull();
  });
});
