import { after } from "next/server";
import HistoryList from "@/components/HistoryList";
import { auth } from "@/lib/auth";
import { getUserJoinedAt, recordUserSeen } from "@/lib/userData";
import { getUniqueWordsMostRecent, getHistoryForUser } from "@/lib/words";

export const metadata = { title: "History — Curio" };

export default async function HistoryPage() {
  const session = await auth();
  if (session?.user?.id) after(() => recordUserSeen(session.user.id));
  const joinedAtStr = session?.user?.id ? await getUserJoinedAt(session.user.id) : null;
  const allEntries = getUniqueWordsMostRecent();
  const personalEntries =
    session?.user?.id && joinedAtStr
      ? getHistoryForUser(session.user.id, new Date(joinedAtStr + "T00:00:00Z"))
      : null;

  return <HistoryList allEntries={allEntries} personalEntries={personalEntries} />;
}
