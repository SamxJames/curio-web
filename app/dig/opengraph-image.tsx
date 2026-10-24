import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { ogDigTheme } from "@/lib/ogDigTheme";

export const alt = "curio dig: a daily word game";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const caslon = readFile(join(process.cwd(), "assets/fonts/LibreCaslonText-Bold.woff"));

export default async function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: ogDigTheme.paper, color: ogDigTheme.ink }}>
        <div style={{ display: "flex", flexDirection: "column", padding: "64px 80px 0" }}>
          <div style={{ display: "flex", fontFamily: "Caslon", fontSize: 104 }}>curio dig</div>
          <div style={{ display: "flex", fontSize: 36, color: ogDigTheme.inkSoft, marginTop: 12 }}>Seven prompts a day. Rarer words dig deeper.</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
          {ogDigTheme.strata.map((c) => <div key={c} style={{ display: "flex", height: 52, background: c }} />)}
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Caslon", data: await caslon, weight: 700, style: "normal" }] }
  );
}
