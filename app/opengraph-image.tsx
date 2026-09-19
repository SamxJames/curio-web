import { ImageResponse } from "next/og";
import { ogTheme } from "@/lib/ogTheme";

export const alt = "Curio — one word, one story, every day";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The default OG image for every page that doesn't have its own (every page
// except /story/[slug], which shows the actual word instead) — used when a
// link to Curio itself, rather than to one specific word, gets shared.
export default function Image() {
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
        <div style={{ display: "flex", fontSize: 96, fontWeight: 600 }}>Curio</div>
        <div style={{ display: "flex", fontSize: 36, color: ogTheme.inkSoft, marginTop: 24 }}>
          One word. One story. Every day.
        </div>
      </div>
    ),
    { ...size }
  );
}
