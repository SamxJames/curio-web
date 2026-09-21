import type { MetadataRoute } from "next";
import { buildSitemapEntries } from "@/lib/seoRoutes";

// The URL count (one per word in WORDS, plus a handful of public routes) is
// far inside the sitemaps.org 50,000-URL / 50MB ceiling, so no
// generateSitemaps() split is needed. Revisit only if WORDS grows past
// ~45,000.
export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemapEntries();
}
