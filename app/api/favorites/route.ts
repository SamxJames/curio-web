import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserFavorites, setUserFavorite } from "@/lib/userData";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const favorites = await getUserFavorites(session.user.id);
  return NextResponse.json({ slugs: Array.from(favorites) });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as
    | { slug?: string; favorited?: boolean }
    | null;
  if (!body?.slug || typeof body.favorited !== "boolean") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  await setUserFavorite(session.user.id, body.slug, body.favorited);
  return NextResponse.json({ ok: true });
}
