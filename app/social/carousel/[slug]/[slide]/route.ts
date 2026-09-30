import sharp from "sharp";
import { getWordBySlug } from "@/lib/words";
import { buildCarouselSlides, needsFallbackFont, slideText } from "@/lib/socialPost";
import { renderSlidePng } from "@/lib/carouselImage";

/** Images for Meta's fetcher, not pages: robots.txt allows them (so the
 * fetcher can't be turned away) and every response says noindex instead. */
const NOINDEX = { "x-robots-tag": "noindex" };

/** One carousel slide as JPEG. Instagram publishes JPEG only and fetches
 * each slide from a public URL at post time, so these must be reachable
 * and deterministic. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; slide: string }> }
) {
  const { slug, slide } = await params;
  const word = getWordBySlug(slug);
  const n = Number(slide);
  const slides = word ? buildCarouselSlides(word) : [];
  if (!word || !Number.isInteger(n) || n < 1 || n > slides.length) {
    return new Response("Not found", { status: 404, headers: NOINDEX });
  }

  const png = await renderSlidePng(slides[n - 1]);
  const jpeg = await sharp(png).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpeg), {
    headers: {
      ...NOINDEX,
      "content-type": "image/jpeg",
      // A word's slides only change on deploy, so the CDN can hold them a
      // day — except a slide needing a Google Font: next/og draws boxes when
      // that download fails, and a cached copy of that could be what Meta
      // fetches.
      "cache-control": needsFallbackFont(slideText(slides[n - 1]))
        ? "no-store"
        : "public, max-age=3600, s-maxage=86400",
    },
  });
}
