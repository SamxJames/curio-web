import sharp from "sharp";
import { getWordBySlug } from "@/lib/words";
import { buildCarouselSlides } from "@/lib/socialPost";
import { renderSlidePng } from "@/lib/carouselImage";

/** One carousel slide as JPEG. Instagram publishes JPEG only and fetches
 * each slide from a public URL at post time, so these must be reachable
 * and deterministic. Disallowed in robots.txt: they're images for Meta's
 * fetcher, not pages. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; slide: string }> }
) {
  const { slug, slide } = await params;
  const word = getWordBySlug(slug);
  const n = Number(slide);
  const slides = word ? buildCarouselSlides(word) : [];
  if (!word || !Number.isInteger(n) || n < 1 || n > slides.length) {
    return new Response("Not found", { status: 404 });
  }

  const png = await renderSlidePng(slides[n - 1]);
  const jpeg = await sharp(png).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpeg), {
    headers: {
      "content-type": "image/jpeg",
      // A word's slides only change on deploy; let the CDN hold them a day.
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
