/** Where to send someone after they sign in: the page they were on, carried
 * through the login flow as `?next=`. Only same-site paths are allowed, so a
 * crafted link can't bounce a fresh session to another site; anything else
 * (and the login/API routes themselves) falls back to "/". */
export function safeReturnPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  if (raw === "/login" || raw.startsWith("/login?") || raw.startsWith("/api/")) return "/";
  return raw;
}

/** The header's Sign in link for the current page. Home needs no `next`. */
export function loginHref(pathname: string | null): string {
  const next = safeReturnPath(pathname);
  return next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;
}
