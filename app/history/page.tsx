import { after } from "next/server";
import HistoryList from "@/components/HistoryList";
import { auth } from "@/lib/auth";
import { getUserJoinedAt, recordUserSeen } from "@/lib/userData";
import { resolveUniqueWordsMostRecent, resolveHistoryForUser } from "@/lib/words";

export const metadata = { title: "History — Curio" };

// HistoryList only ever reads `.slug` and `.word` off each entry's word —
// projecting down to that here (rather than sending the full WordEntry,
// origin/journey/related prose included) keeps this page's payload
// proportional to what's actually displayed instead of the full archive's
// word content, which only grows as the word bank does.
function toPreview(entries: { date: string; word: { slug: string; word: string } }[]) {
  return entries.map(({ date, word }) => ({ date, word: { slug: word.slug, word: word.word } }));
}

export default async function HistoryPage() {
  const session = await auth();
  if (session?.user?.id) after(() => recordUserSeen(session.user.id));
  const joinedAtStr = session?.user?.id ? await getUserJoinedAt(session.user.id) : null;
  const allEntries = toPreview(await resolveUniqueWordsMostRecent());
  const personalEntries =
    session?.user?.id && joinedAtStr
      ? toPreview(await resolveHistoryForUser(session.user.id, new Date(joinedAtStr + "T00:00:00Z")))
      : null;

  return <HistoryList allEntries={allEntries} personalEntries={personalEntries} />;
}
