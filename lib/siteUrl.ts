// The same CURIO_SITE_URL + localhost fallback that lib/email.ts,
// lib/bluesky.ts and app/layout.tsx each already spell out inline. Those
// three are deliberately left alone here: refactoring outbound email and a
// public Bluesky post mid-SEO-task risks a lot to save three lines. New
// code goes through here so the SEO surface at least has one source of
// truth for the origin.
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
