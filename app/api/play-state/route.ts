import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserPlayState, setUserPlayState } from "@/lib/userData";
import type { PlayState } from "@/lib/storage";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const puzzleDate = req.nextUrl.searchParams.get("date");
  if (!puzzleDate) {
    return NextResponse.json({ error: "Missing date query param." }, { status: 400 });
  }
  const state = await getUserPlayState(session.user.id, puzzleDate);
  return NextResponse.json({ state });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as PlayState | null;
  if (!body?.puzzleDate || !body.status) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  await setUserPlayState(session.user.id, body.puzzleDate, body);
  return NextResponse.json({ ok: true });
}
