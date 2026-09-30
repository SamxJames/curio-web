import { ImageResponse } from "next/og";
import { ogTheme } from "./ogTheme";
import { CAROUSEL_SIZE, SLIDE_COPY, storyLabel, type Slide } from "./socialPost";

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
          <div style={label}>{SLIDE_COPY.brand}</div>
          <div style={{ display: "flex", fontSize: 72, lineHeight: 1.2, marginTop: 40 }}>{slide.text}</div>
          <div style={{ ...label, marginTop: 80 }}>{SLIDE_COPY.swipe}</div>
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
    case "story": {
      // A lone story slide gets no "1 / 1": the sentence alone, centred.
      const counter = storyLabel(slide);
      return (
        <div style={frame}>
          {counter && <div style={label}>{counter}</div>}
          <div
            style={{ display: "flex", fontSize: storyFontSize(slide.text), lineHeight: 1.4, marginTop: counter ? 40 : 0 }}
          >
            {slide.text}
          </div>
        </div>
      );
    }
    case "outro":
      return (
        <div style={frame}>
          <div style={{ display: "flex", fontSize: 64, lineHeight: 1.25 }}>{SLIDE_COPY.outroLine}</div>
          <div style={{ display: "flex", fontSize: 56, fontWeight: 600, marginTop: 56 }}>{SLIDE_COPY.outroSite}</div>
          <div style={{ display: "flex", fontSize: 38, color: ogTheme.inkSoft, marginTop: 28 }}>
            {SLIDE_COPY.outroTagline}
          </div>
        </div>
      );
  }
}

/** PNG from next/og. Missing glyphs (Greek, Arabic, Han…) come from
 * Google Fonts via ImageResponse's own dynamic font loading, the same as
 * the story Open Graph images. A failed download only logs and draws
 * boxes, so the slide route never lets a CDN cache those slides
 * (needsFallbackFont in lib/socialPost.ts). */
export async function renderSlidePng(slide: Slide): Promise<Uint8Array> {
  const res = new ImageResponse(<SlideBody slide={slide} />, { ...CAROUSEL_SIZE });
  return new Uint8Array(await res.arrayBuffer());
}
