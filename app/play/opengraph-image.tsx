import { ImageResponse } from "next/og";
import { getTodayPuzzle } from "@/lib/puzzle";
import { ogTheme } from "@/lib/ogTheme";

export const alt = "Curio — Daily Puzzle";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// getTodayPuzzle() is date-dependent (via lib/day.ts's clock), same as the /play page
// — without this, Next statically prerenders the image at build time and keeps
// serving that frozen puzzle until the next deploy, rather than recomputing
// today's puzzle on every request.
export const dynamic = "force-dynamic";

// Deliberately generic: this must never show the word, a clue, or any
// other spoiler, since a shared /play link is exactly the case where the
// recipient hasn't played yet. Only the puzzle number (a non-spoiling
// fact) and the site's existing tagline appear.
export default function Image() {
  const puzzle = getTodayPuzzle();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: ogTheme.paper,
          color: ogTheme.ink,
        }}
      >
        <div style={{ display: "flex", fontSize: 28, color: ogTheme.inkSoft, letterSpacing: 1 }}>
          CURIO
        </div>
        <div style={{ display: "flex", fontSize: 88, fontWeight: 600, marginTop: 20 }}>
          {puzzle ? `Daily Puzzle #${puzzle.puzzleNumber}` : "Daily Puzzle"}
        </div>
        <div style={{ display: "flex", fontSize: 32, color: ogTheme.inkSoft, marginTop: 24 }}>
          One word. One story. Every day.
        </div>
      </div>
    ),
    { ...size }
  );
}
