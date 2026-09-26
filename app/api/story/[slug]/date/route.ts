import { NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
import { formatDay } from "@/lib/day";
import { recordUserSeen } from "@/lib/userData";
import { getWordBySlug, resolveHistory } from "@/lib/words";

/** The "featured on <date>" line and today's word for a story page, plus
 * the recordUserSeen side effect that used to fire from the page body.
 *
 * This lives behind a request rather than in app/story/[slug]/page.tsx
 * because that page must never call auth() — reading cookies there forces
 * all 1,147 story pages to render dynamically. See docs/superpowers/specs/
 * 2026-09-20-search-discoverability-design.md.
 *
 * The date is the shared calendar's, the same for every visitor (no
 * per-account rotation since 2026-09-26); auth() is only here for
 * recordUserSeen. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!getWordBySlug(slug)) {
    return NextResponse.json({ date: null, today: null }, { status: 404 });
  }

  const session = await auth();
  if (session?.user?.id) after(() => recordUserSeen(session.user.id));
  // resolveHistory is most recent first, so its head is today — the same
  // locked word home, the digest and Bluesky show. Returned here (rather
  // than read in the page) for the page's "Today's word is ___" link, so
  // the page itself stays static.
  const history = await resolveHistory();
  const historyEntry = history.find((d) => d.word.slug === slug);
  const date = historyEntry ? formatDay(historyEntry.date) : null;
  // history can be empty (e.g. system clock before the shared calendar's
  // START_DATE) — guard the head rather than assume one exists.
  const today = history.length > 0 ? { slug: history[0].word.slug, word: history[0].word.word } : null;

  // Every request must reach the function so recordUserSeen fires for
  // signed-in visitors — never let a CDN answer this.
  return NextResponse.json({ date, today }, { headers: { "Cache-Control": "private, no-store" } });
}
