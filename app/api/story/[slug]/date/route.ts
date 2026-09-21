import { NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
import { getUserJoinedAt, recordUserSeen } from "@/lib/userData";
import { getWordBySlug, resolveHistory, resolveHistoryForUser } from "@/lib/words";

/** The "featured on <date>" line for a story page, and the recordUserSeen
 * side effect that used to fire from the page body.
 *
 * This lives behind a request rather than in app/story/[slug]/page.tsx
 * because that page calls auth(), which reads cookies and forces the whole
 * route to render dynamically — with 1,147 story pages that is the
 * difference between a prerendered CDN asset and a server render plus a
 * 263-key Redis mget per view. See docs/superpowers/specs/
 * 2026-09-20-search-discoverability-design.md.
 *
 * The signed-in branch is unchanged: an account's own personalized date for
 * this word wins over the shared calendar's, because the two rotations are
 * independent and the shared date can be a stale day for someone whose
 * personal rotation is showing this word right now. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!getWordBySlug(slug)) {
    return NextResponse.json({ date: null }, { status: 404 });
  }

  const session = await auth();
  if (session?.user?.id) after(() => recordUserSeen(session.user.id));
  const joinedAtStr = session?.user?.id ? await getUserJoinedAt(session.user.id) : null;
  const personalEntry =
    session?.user?.id && joinedAtStr
      ? (await resolveHistoryForUser(session.user.id, new Date(joinedAtStr + "T00:00:00Z"))).find(
          (d) => d.word.slug === slug
        )
      : undefined;
  const historyEntry = personalEntry ?? (await resolveHistory()).find((d) => d.word.slug === slug);
  const date = historyEntry
    ? new Date(historyEntry.date + "T00:00:00Z").toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : null;

  // Personalized per account — must never be cached by a CDN or shared
  // between visitors.
  return NextResponse.json({ date }, { headers: { "Cache-Control": "private, no-store" } });
}
