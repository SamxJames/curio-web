import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { dayNumber, digLaunchDate, isPastDay } from "@/lib/dig/clock";
import { readDay } from "@/lib/dig/server";
import { ogDigTheme } from "@/lib/ogDigTheme";

export const alt = "curio dig answers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

const caslon = readFile(join(process.cwd(), "assets/fonts/LibreCaslonText-Bold.woff"));

/** "curio dig, day N" and that finished day's prompts. Prompts aren't answers, and this
 * only ever renders for past days. */
export default async function Image({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const launch = digLaunchDate();
  const day = launch && isPastDay(date, new Date(), launch) ? await readDay(date).catch(() => null) : null;
  const title = day && launch ? `curio dig, day ${dayNumber(date, launch)}` : "curio dig";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: ogDigTheme.paper, color: ogDigTheme.ink }}>
        <div style={{ display: "flex", flexDirection: "column", padding: "56px 80px 0" }}>
          <div style={{ display: "flex", fontFamily: "Caslon", fontSize: 80 }}>{title}</div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 24 }}>
            {(day?.prompts ?? []).map((p) => (
              <div key={p.id} style={{ display: "flex", fontSize: 30, color: ogDigTheme.inkSoft, marginTop: 8 }}>{p.text}</div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
          {ogDigTheme.strata.map((c) => <div key={c} style={{ display: "flex", height: 14, background: c }} />)}
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Caslon", data: await caslon, weight: 700, style: "normal" }] }
  );
}
