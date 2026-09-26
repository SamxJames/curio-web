import { NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
import { formatDay } from "@/lib/day";
import { recordUserSeen } from "@/lib/userData";
import { getWordBySlug, resolveHistory } from "@/lib/words";

/** The "featured on <date>" line for a story page, and the recordUserSeen
 * side effect that used to fire from the page body.
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
    return NextResponse.json({ date: null }, { status: 404 });
  }

  const session = await auth();
  if (session?.user?.id) after(() => recordUserSeen(session.user.id));
  const historyEntry = (await resolveHistory()).find((d) => d.word.slug === slug);
  const date = historyEntry ? formatDay(historyEntry.date) : null;

  // Every request must reach the function so recordUserSeen fires for
  // signed-in visitors — never let a CDN answer this.
  return NextResponse.json({ date }, { headers: { "Cache-Control": "private, no-store" } });
}
