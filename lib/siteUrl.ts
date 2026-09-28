// The one place that resolves CURIO_SITE_URL, with a localhost fallback for
// local dev. lib/email.ts, lib/bluesky.ts and app/layout.tsx all build their
// URLs through siteUrl()/absoluteUrl() rather than keeping their own copy.
const FALLBACK_ORIGIN = "http://localhost:3000";

/** The site's public origin, never with a trailing slash. */
export function siteUrl(): string {
  // `||` rather than `??` on purpose — an env var set to "" is a
  // misconfiguration, not a deliberate empty origin, and would otherwise
  // produce protocol-relative garbage like "//sitemap.xml".
  return (process.env.CURIO_SITE_URL || FALLBACK_ORIGIN).replace(/\/+$/, "");
}

export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
