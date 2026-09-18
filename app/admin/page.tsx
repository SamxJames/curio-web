import { redirect } from "next/navigation";
import { auth, getUserEmail } from "@/lib/auth";
import { getAllSubscriberRecords } from "@/lib/db";
import { getAllUserActivity, getFavoritesSummary, getAllPlayStates } from "@/lib/userData";
import { getEmailMetrics } from "@/lib/resendMetrics";
import {
  bucketDatesByDay,
  cumulativeGrowth,
  summarizePuzzleEngagement,
  computeRollingRetention,
  buildAccountSummaries,
} from "@/lib/adminStats";
import AdminDashboard from "@/components/AdminDashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin — Curio" };

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // No distinguishing error for a signed-in-but-wrong-email visitor — a
  // plain redirect home doesn't confirm this page exists at all.
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!session.user.email || session.user.email.toLowerCase() !== adminEmail) redirect("/");

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
    bucketDatesByDay(
      subscribers.map((s) => s.createdAt?.slice(0, 10)).filter((d): d is string => !!d)
    )
  );
  const accountGrowth = cumulativeGrowth(bucketDatesByDay(userActivity.map((u) => u.joinedAt)));
  const puzzleEngagement = summarizePuzzleEngagement(playStates);
  const retention = {
    day1: computeRollingRetention(userActivity, 1, now),
    day7: computeRollingRetention(userActivity, 7, now),
    day30: computeRollingRetention(userActivity, 30, now),
  };

  // Sorted newest first — "who signed up" reads most naturally as a feed,
  // not a growth chart. Subscribers already carry createdAt; accounts only
  // carry a userId/joinedAt pair (getAllUserActivity), so their emails are
  // fetched separately (one adapter call each — fine at this app's scale,
  // same N+1-is-fine-for-now tradeoff already accepted for the other admin
  // reads) and paired up by buildAccountSummaries.
  const subscriberList = [...subscribers].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const accountEmails = Object.fromEntries(
    await Promise.all(
      userActivity.map(async (u) => [u.userId, await getUserEmail(u.userId)] as const)
    )
  );
  const accountList = buildAccountSummaries(userActivity, accountEmails);

  return (
    <AdminDashboard
      subscriberCount={subscribers.length}
      accountCount={userActivity.length}
      subscriberGrowth={subscriberGrowth}
      accountGrowth={accountGrowth}
      subscriberList={subscriberList}
      accountList={accountList}
      favorites={favorites}
      puzzleEngagement={puzzleEngagement}
      retention={retention}
      emailMetrics7d={emailMetrics7d}
      emailMetrics30d={emailMetrics30d}
    />
  );
}
