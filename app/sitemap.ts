import type { MetadataRoute } from "next";
import { buildSitemapEntries, digSitemapEntries } from "@/lib/seoRoutes";
import { isDigOpen } from "@/lib/dig/clock";
import { pastDates } from "@/lib/dig/server";

// The URL count (one per word in WORDS, plus a handful of public routes) is
// far inside the sitemaps.org 50,000-URL / 50MB ceiling, so no
// generateSitemaps() split is needed. Revisit only if WORDS grows past
// ~45,000.
//
// Hourly revalidation: the dig archive grows by one day a day, and a sitemap
// is a metadata route that takes route segment config like a Route Handler
// (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/sitemap.md;
// 02-route-segment-config/index.md).
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const dates = isDigOpen()
    ? await pastDates().catch((err: unknown) => {
        // Counts-only logging: the error message, never a key or token.
        console.error("sitemap: dig past dates unavailable:", err instanceof Error ? err.message : "unknown");
        return [] as string[];
      })
    : null;
  const dig = dates ? digSitemapEntries(dates) : [];
  return [...buildSitemapEntries(), ...dig];
}
