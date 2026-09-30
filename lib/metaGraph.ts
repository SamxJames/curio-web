/** Shared plumbing for the Meta Graph API posters (Threads, Instagram). */

const TIMEOUT_MS = 15_000;

/** An error whose message we authored (or took from Meta's error JSON), so
 * it's safe to log. Anything else — a fetch rejection — can echo the request
 * URL, and the status poll carries the token in its query string, so those
 * are logged by name only. */
export class SafeError extends Error {}

export async function call(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = (body.error as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`;
    throw new SafeError(message);
  }
  return body;
}

/** A create call's container id. A 200 without one must stop the post
 * rather than carry "undefined" into the next step. */
export function containerId(body: Record<string, unknown>): string {
  if (typeof body.id !== "string" || !body.id) throw new SafeError("no container id");
  return body.id;
}

/** A token lookup that rejected, by error name only: @upstash/redis puts the
 * failed command's body in its message, and the token record is in it. */
export function tokenLookupFailed(err: unknown): SafeError {
  return new SafeError(`token lookup failed (${err instanceof Error ? err.name : "unknown"})`);
}

export const form = (fields: Record<string, string>) => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(fields).toString(),
});

/** What's safe to log for a failed post: our own messages in full, anything
 * else by name only, and the token redacted (raw and URL-encoded) as a
 * backstop. */
export function failureReason(err: unknown, token: string | null): string {
  let reason = err instanceof SafeError ? err.message : err instanceof Error ? err.name : "unknown error";
  if (token) {
    for (const secret of new Set([token, encodeURIComponent(token)])) reason = reason.split(secret).join("[redacted]");
  }
  return reason;
}
