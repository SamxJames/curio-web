import { ImageResponse } from "next/og";
import { ogTheme } from "./ogTheme";
import { CAROUSEL_SIZE, type Slide } from "./socialPost";

/** Long sentences step down so the longest origin sentence (354 chars in
 * the bank on 2026-09-29) still fits a 1080-wide slide. */
function storyFontSize(text: string): number {
  if (text.length <= 140) return 60;
  if (text.length <= 240) return 50;
  return 42;
}

const frame = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column" as const,
  justifyContent: "center",
  padding: "96px",
  background: ogTheme.paper,
  color: ogTheme.ink,
};

const label = { display: "flex", fontSize: 30, color: ogTheme.inkSoft, letterSpacing: 2 };

function SlideBody({ slide }: { slide: Slide }) {
  switch (slide.kind) {
    case "hook":
      return (
        <div style={frame}>
          <div style={label}>CURIO</div>
          <div style={{ display: "flex", fontSize: 72, lineHeight: 1.2, marginTop: 40 }}>{slide.text}</div>
          <div style={{ ...label, marginTop: 80 }}>Swipe →</div>
        </div>
      );
    case "word":
      return (
        <div style={frame}>
          <div style={{ display: "flex", fontSize: 150, fontWeight: 600, lineHeight: 1 }}>{slide.word}</div>
          <div style={{ display: "flex", fontSize: 38, color: ogTheme.inkFaint, marginTop: 28 }}>
            {slide.respelling} · {slide.partOfSpeech}
          </div>
          <div style={{ display: "flex", fontSize: 44, lineHeight: 1.4, marginTop: 72 }}>{slide.lineage}</div>
        </div>
      );
    case "story":
      return (
        <div style={frame}>
          <div style={label}>{`${slide.index} / ${slide.total}`}</div>
          <div style={{ display: "flex", fontSize: storyFontSize(slide.text), lineHeight: 1.4, marginTop: 40 }}>
            {slide.text}
          </div>
        </div>
      );
    case "outro":
      return (
        <div style={frame}>
          <div style={{ display: "flex", fontSize: 64, lineHeight: 1.25 }}>One word&apos;s origin story, every morning.</div>
          <div style={{ display: "flex", fontSize: 56, fontWeight: 600, marginTop: 56 }}>curioword.com</div>
          <div style={{ display: "flex", fontSize: 38, color: ogTheme.inkSoft, marginTop: 28 }}>No feed, no backlog.</div>
        </div>
      );
  }
}

/** PNG from next/og. Missing glyphs (Greek, Arabic, Han…) come from
 * Google Fonts via ImageResponse's own dynamic font loading, the same as
 * the story Open Graph images. */
export async function renderSlidePng(slide: Slide): Promise<Uint8Array> {
  const res = new ImageResponse(<SlideBody slide={slide} />, { ...CAROUSEL_SIZE });
  return new Uint8Array(await res.arrayBuffer());
}
