import HomeContent from "@/components/HomeContent";
import { auth } from "@/lib/auth";
import { getUserJoinedAt, recordUserSeen } from "@/lib/userData";
import { getTodayWord, getWordForUser } from "@/lib/words";

export default async function TodayPage() {
  const session = await auth();
  if (session?.user?.id) void recordUserSeen(session.user.id);
  const joinedAtStr = session?.user?.id ? await getUserJoinedAt(session.user.id) : null;
  const isPersonalized = !!joinedAtStr;
  const word = isPersonalized
    ? getWordForUser(session!.user.id, new Date(joinedAtStr! + "T00:00:00Z"))
    : getTodayWord();

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return <HomeContent word={word} date={today} isPersonalized={isPersonalized} />;
}
