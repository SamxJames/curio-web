import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { importFavoritesOnce } from "@/lib/userData";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { slugs?: string[] } | null;
  const slugs = Array.isArray(body?.slugs) ? body.slugs.filter((s) => typeof s === "string") : [];
  const imported = await importFavoritesOnce(session.user.id, slugs);
  return NextResponse.json({ imported });
}
