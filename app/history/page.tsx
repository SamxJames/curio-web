import HistoryList from "@/components/HistoryList";
import { auth } from "@/lib/auth";
import { getUserJoinedAt } from "@/lib/userData";
import { getHistory, getHistoryForUser } from "@/lib/words";

export const metadata = { title: "History — Curio" };

export default async function HistoryPage() {
  const session = await auth();
  const joinedAtStr = session?.user?.id ? await getUserJoinedAt(session.user.id) : null;
  const entries =
    session?.user?.id && joinedAtStr
      ? getHistoryForUser(session.user.id, new Date(joinedAtStr + "T00:00:00Z"))
      : getHistory();

  return <HistoryList entries={entries} />;
}
