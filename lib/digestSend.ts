/** Resend's documented maximum emails per batch request. */
export const BATCH_SIZE = 100;
/** Retries after the first attempt, so at most 4 requests per chunk. */
export const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;
/** A retry-after longer than this isn't worth holding the cron open for:
 * the chunk counts as failed and `?resend=failed` picks it up later. */
const MAX_DELAY_MS = 30_000;

export type BatchError = { message: string; statusCode: number | null; name: string };
export type BatchResult =
  | {
      data: { data: { id: string }[]; errors?: { index: number; message: string }[] };
      error: null;
      headers: Record<string, string> | null;
    }
  | { data: null; error: BatchError; headers: Record<string, string> | null };
export type SendBatch<T> = (chunk: T[], idempotencyKey: string) => Promise<BatchResult>;
export type SendOutcome = {
  attempted: number;
  sent: number;
  failed: number;
  errors: string[];
  /** Who wasn't accepted. Never log this. (The cron's pending set is kept
   * through `onSent` instead, so it survives a run killed partway.) */
  failedRecipients: string[];
};

export function chunk<T>(items: T[], size: number = BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Resend's per-email validation messages can quote the address. */
export function redactAddresses(message: string): string {
  return message.replace(/[^\s@<>"',;:()]+@[^\s@<>"',;:()]+/g, "[address]");
}

// Quota errors come back as 429 too, but no amount of waiting fixes them.
const NEVER_RETRY = new Set(["daily_quota_exceeded", "monthly_quota_exceeded"]);
// concurrent_idempotent_requests is the 409 a retry gets while Resend is
// still processing the original request under the same key; its docs say
// to retry it.
const ALWAYS_RETRY = new Set([
  "rate_limit_exceeded",
  "application_error",
  "internal_server_error",
  "concurrent_idempotent_requests",
]);

function isRetryable(error: BatchError): boolean {
  if (NEVER_RETRY.has(error.name)) return false;
  if (ALWAYS_RETRY.has(error.name)) return true;
  return error.statusCode === null || error.statusCode === 429 || error.statusCode >= 500;
}

/** `retry-after` (seconds or an HTTP date) when Resend sends one, else
 * 1s/2s/4s. Null means "longer than we're willing to wait". */
export function retryDelayMs(
  headers: Record<string, string> | null,
  attempt: number,
  now: number
): number | null {
  const header = headers?.["retry-after"];
  let ms = BASE_DELAY_MS * 2 ** attempt;
  if (header) {
    const seconds = Number(header);
    const at = Date.parse(header);
    if (Number.isFinite(seconds)) ms = Math.max(0, seconds * 1000);
    else if (!Number.isNaN(at)) ms = Math.max(0, at - now);
  }
  return ms > MAX_DELAY_MS ? null : ms;
}

/** Sends every message in sequential chunks of BATCH_SIZE, one request at a
 * time, so a morning's send stays inside Resend's per-team rate limit. A
 * 429/5xx/network failure retries the same chunk with the same idempotency
 * key, so a retry of a request Resend actually processed can't double-send.
 * Never throws: everything that couldn't be sent is counted in `failed`. */
export async function sendInBatches<T extends { to: string }>(
  messages: T[],
  opts: {
    sendBatch: SendBatch<T>;
    /** Unique per run: Resend dedupes on it for 24 hours. */
    keyPrefix: string;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    /** Epoch ms. No retry wait or new chunk may start past it. */
    deadline?: number;
    /** Awaited after each accepted chunk with its accepted recipients, so the
     * cron can forget them before the next chunk: a run that dies partway
     * leaves only the not-yet-sent addresses behind. */
    onSent?: (recipients: string[]) => Promise<void>;
  }
): Promise<SendOutcome> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const deadline = opts.deadline ?? Number.POSITIVE_INFINITY;
  const out: SendOutcome = { attempted: messages.length, sent: 0, failed: 0, errors: [], failedRecipients: [] };

  const failAll = (c: T[], message: string) => {
    out.failed += c.length;
    out.failedRecipients.push(...c.map((m) => m.to));
    out.errors.push(redactAddresses(message));
  };

  for (const [index, c] of chunk(messages).entries()) {
    if (now() >= deadline) {
      failAll(c, "deadline reached before this batch started");
      continue;
    }
    const key = `${opts.keyPrefix}-${index}`;

    for (let attempt = 0; ; attempt++) {
      let result: BatchResult;
      try {
        result = await opts.sendBatch(c, key);
      } catch (err) {
        result = {
          data: null,
          error: { name: "application_error", statusCode: null, message: err instanceof Error ? err.message : String(err) },
          headers: null,
        };
      }

      if (!result.error) {
        const rejected = result.data.errors ?? [];
        const rejectedIndexes = new Set<number>();
        for (const { index: i, message } of rejected) {
          const m = c[i];
          if (m) {
            rejectedIndexes.add(i);
            out.failed++;
            out.failedRecipients.push(m.to);
          }
          out.errors.push(redactAddresses(message));
        }
        const accepted = c.filter((_, i) => !rejectedIndexes.has(i)).map((m) => m.to);
        out.sent += accepted.length;
        if (opts.onSent && accepted.length > 0) {
          try {
            await opts.onSent(accepted);
          } catch (err) {
            console.error("[curio:digest] onSent failed:", redactAddresses(err instanceof Error ? err.message : String(err)));
          }
        }
        break;
      }

      const summary = `${result.error.name}: ${result.error.message}`;
      if (!isRetryable(result.error) || attempt >= MAX_RETRIES) {
        failAll(c, summary);
        break;
      }
      const wait = retryDelayMs(result.headers, attempt, now());
      if (wait === null || now() + wait >= deadline) {
        failAll(c, `${summary} (no time left to retry)`);
        break;
      }
      await sleep(wait);
    }
  }
  return out;
}
