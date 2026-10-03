// Shared HTTP plumbing for the demand report: requests go out one at a
// time with a minimum gap between their starts, and 429s, 5xx responses
// and network errors are retried with exponential backoff (or the server's
// Retry-After, when it gives one). fetch, sleep and the clock are
// injectable so tests never touch the network or wait in real time.

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type FetcherOptions = {
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Total tries per request, including the first. */
  attempts?: number;
  /** First backoff delay; doubles on each retry. */
  baseDelayMs?: number;
  /** Minimum time between the starts of consecutive requests. */
  minGapMs?: number;
};

const MAX_RETRY_AFTER_MS = 60_000;

/** A Retry-After header (seconds or an HTTP date) as milliseconds, capped at a minute. */
export function retryAfterMs(header: string | null, nowMs: number): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }
  const at = Date.parse(header);
  if (Number.isNaN(at)) return null;
  return Math.min(Math.max(at - nowMs, 0), MAX_RETRY_AFTER_MS);
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

export function createFetcher(options: FetcherOptions = {}): FetchLike {
  const doFetch = options.fetch ?? ((url, init) => fetch(url, init));
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const attempts = options.attempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const minGapMs = options.minGapMs ?? 0;
  let lastStart = Number.NEGATIVE_INFINITY;

  return async (url, init) => {
    for (let attempt = 1; ; attempt++) {
      const wait = lastStart + minGapMs - now();
      if (wait > 0) await sleep(wait);
      lastStart = now();

      const lastTry = attempt >= attempts;
      const backoff = baseDelayMs * 2 ** (attempt - 1);
      let response: Response;
      try {
        response = await doFetch(url, init);
      } catch (error) {
        if (lastTry) throw error;
        await sleep(backoff);
        continue;
      }
      if (!isRetryable(response.status) || lastTry) return response;

      const delay = retryAfterMs(response.headers.get("retry-after"), now()) ?? backoff;
      await response.body?.cancel().catch(() => undefined);
      await sleep(delay);
    }
  };
}
