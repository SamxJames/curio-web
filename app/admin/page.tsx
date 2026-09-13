import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAllSubscriberRecords } from "@/lib/db";
import { getAllUserActivity, getFavoritesSummary, getAllPlayStates } from "@/lib/userData";
import { getEmailMetrics } from "@/lib/resendMetrics";
import {
  bucketDatesByDay,
  cumulativeGrowth,
  summarizePuzzleEngagement,
  computeRollingRetention,
} from "@/lib/adminStats";
import AdminDashboard from "@/components/AdminDashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin — Curio" };

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // No distinguishing error for a signed-in-but-wrong-email visitor — a
  // plain redirect home doesn't confirm this page exists at all.
  if (!session.user.email || session.user.email !== process.env.ADMIN_EMAIL) redirect("/");

  const now = new Date();
  const [subscribers, userActivity, favorites, playStates, emailMetrics7d, emailMetrics30d] =
    await Promise.all([
      getAllSubscriberRecords(),
      getAllUserActivity(),
      getFavoritesSummary(),
      getAllPlayStates(),
      getEmailMetrics(7, now),
      getEmailMetrics(30, now),
    ]);

  const subscriberGrowth = cumulativeGrowth(
    bucketDatesByDay(subscribers.map((s) => s.createdAt.slice(0, 10)))
  );
  const accountGrowth = cumulativeGrowth(bucketDatesByDay(userActivity.map((u) => u.joinedAt)));
  const puzzleEngagement = summarizePuzzleEngagement(playStates);
  const retention = {
    day1: computeRollingRetention(userActivity, 1, now),
    day7: computeRollingRetention(userActivity, 7, now),
    day30: computeRollingRetention(userActivity, 30, now),
  };

  return (
    <AdminDashboard
      subscriberCount={subscribers.length}
      accountCount={userActivity.length}
      subscriberGrowth={subscriberGrowth}
      accountGrowth={accountGrowth}
      favorites={favorites}
      puzzleEngagement={puzzleEngagement}
      retention={retention}
      emailMetrics7d={emailMetrics7d}
      emailMetrics30d={emailMetrics30d}
    />
  );
}
