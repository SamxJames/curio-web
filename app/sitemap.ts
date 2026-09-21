import type { MetadataRoute } from "next";
import { buildSitemapEntries } from "@/lib/seoRoutes";

// 1,151 URLs today (1,147 words + 4 public routes) — far inside the
// sitemaps.org 50,000-URL / 50MB ceiling, so no generateSitemaps() split is
// needed. Revisit only if WORDS grows past ~45,000.
export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemapEntries();
}
