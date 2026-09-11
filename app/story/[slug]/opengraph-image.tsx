import { ImageResponse } from "next/og";
import { getWordBySlug } from "@/lib/words";

export const alt = "Curio";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MAX_ORIGIN_LENGTH = 180;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

// A dedicated share image per word — someone sharing a specific word's link
// should see that word, not a generic "Curio" card. Falls back to the
// default site image (via notFound-style empty render) if the slug doesn't
// exist, though that route 404s before this ever renders in practice.
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const word = getWordBySlug(slug);

  if (!word) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#f1ece0",
            color: "#24302b",
            fontSize: 72,
            fontWeight: 600,
          }}
        >
          Curio
        </div>
      ),
      { ...size }
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#f1ece0",
          color: "#24302b",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, color: "#5b665f", letterSpacing: 1 }}>
          CURIO
        </div>
        <div style={{ display: "flex", fontSize: 112, fontWeight: 600, lineHeight: 1, marginTop: 20 }}>
          {word.word}
        </div>
        <div style={{ display: "flex", fontSize: 32, color: "#8a9089", marginTop: 20 }}>
          {word.respelling} &middot; {word.partOfSpeech}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 34,
            lineHeight: 1.45,
            marginTop: 40,
            maxWidth: 1000,
            color: "#24302b",
          }}
        >
          {truncate(word.origin, MAX_ORIGIN_LENGTH)}
        </div>
      </div>
    ),
    { ...size }
  );
}
