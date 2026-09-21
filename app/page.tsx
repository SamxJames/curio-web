import { after } from "next/server";
import HomeContent from "@/components/HomeContent";
import ServerSessionMarker from "@/components/ServerSessionMarker";
import { auth } from "@/lib/auth";
import { getUserJoinedAt, recordUserSeen } from "@/lib/userData";
import { resolveTodayWord, resolveWordForUser } from "@/lib/words";

export default async function TodayPage() {
  const session = await auth();
  if (session?.user?.id) after(() => recordUserSeen(session.user.id));
  const joinedAtStr = session?.user?.id ? await getUserJoinedAt(session.user.id) : null;
  const isPersonalized = !!joinedAtStr;
  const word = isPersonalized
    ? await resolveWordForUser(session!.user.id, new Date(joinedAtStr! + "T00:00:00Z"))
    : await resolveTodayWord();

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      <ServerSessionMarker signedIn={!!session?.user?.id} />
      <HomeContent word={word} date={today} isPersonalized={isPersonalized} />
    </>
  );
}
