/** Fetch today's dig with one retry, so a single network blip doesn't show "didn't load".
 * Retries once after 800ms on a thrown error or a 5xx. A 4xx is returned as is (404 means the dig
 * isn't open). Returns the last Response, or rethrows the last error. Client-safe. */
export const RETRY_DELAY_MS = 800;

export async function fetchDayWithRetry(
  fetchOnce: () => Promise<Response>,
  wait: (ms: number) => Promise<void>,
): Promise<Response> {
  try {
    const first = await fetchOnce();
    if (first.status < 500) return first;
  } catch {
    // fall through to the single retry
  }
  await wait(RETRY_DELAY_MS);
  return fetchOnce();
}
