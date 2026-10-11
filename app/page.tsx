import type { Metadata } from "next";
import { after } from "next/server";
import HomeContent from "@/components/HomeContent";
import ServerSessionMarker from "@/components/ServerSessionMarker";
import { auth } from "@/lib/auth";
import { dayKey, formatDay } from "@/lib/day";
import { buildSiteJsonLd, serializeJsonLd } from "@/lib/storyJsonLd";
import { recordUserSeen } from "@/lib/userData";
import { resolveTodayWord } from "@/lib/words";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function TodayPage() {
  const session = await auth();
  if (session?.user?.id) after(() => recordUserSeen(session.user.id));
  // One shared word for everyone, signed in or not — the "did you see
  // today's word?" conversation depends on it.
  const now = new Date();
  const word = await resolveTodayWord(now);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildSiteJsonLd()) }}
      />
      <ServerSessionMarker signedIn={!!session?.user?.id} />
      <HomeContent word={word} date={formatDay(dayKey(now))} />
    </>
  );
}
