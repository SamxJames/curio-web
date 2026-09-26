/** Whether a page's query string came from a digest email link (see
 * lib/email.ts's digestStoryUrl). Kept out of lib/storage.ts, a
 * "use client" module, so it stays a plain function the tests can import. */
export function isEmailArrival(search: string): boolean {
  return new URLSearchParams(search).get("utm_source") === "email";
}
