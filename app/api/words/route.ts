import { NextRequest, NextResponse } from "next/server";
import { getWordBySlug } from "@/lib/words";
import { toCollectionWord, type CollectionWord } from "@/lib/collection";

const MAX_SLUGS = 500;
const CACHE = "public, s-maxage=86400, stale-while-revalidate=604800";

/** Story data for a list of slugs — Collection's favourites live in the
 * browser (lib/storage.ts), so the page asks for just those words rather
 * than shipping all 1,147 entries to the client. Public content only. */
export function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("slugs") ?? "";
  const slugs = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
  if (slugs.length > MAX_SLUGS) {
    return NextResponse.json({ error: "Too many slugs." }, { status: 400 });
  }
  const words: CollectionWord[] = slugs
    .map((s) => getWordBySlug(s))
    .filter((w): w is NonNullable<typeof w> => !!w)
    .map(toCollectionWord);
  return NextResponse.json({ words }, { headers: { "Cache-Control": CACHE } });
}
