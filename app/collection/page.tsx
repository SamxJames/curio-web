import { redirect } from "next/navigation";
import CollectionScreen from "@/components/CollectionScreen";
import { auth } from "@/lib/auth";
import { getUserJoinedAt, recordUserSeen } from "@/lib/userData";
import { getHistoryForUser } from "@/lib/words";

export const metadata = { title: "Your collection — Curio" };

export default async function CollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  void recordUserSeen(session.user.id);

  const { tab } = await searchParams;
  const joinedAtStr = await getUserJoinedAt(session.user.id);
  const entries = joinedAtStr
    ? getHistoryForUser(session.user.id, new Date(joinedAtStr + "T00:00:00Z"))
    : [];

  return <CollectionScreen entries={entries} tab={tab === "history" ? "history" : "collection"} />;
}
