"use client";

import { formatDepth } from "@/lib/dig/score";
import { STRATA, STRATUM_DARK, STRATUM_HEX, strataLayout } from "@/lib/dig/strata";
import type { Tier } from "@/lib/dig/types";

const SIZE = 1080;
const INK = "#1C1A17", PAPER = "#F5F1E8";

const isAbort = (e: unknown) => (e as { name?: string } | null)?.name === "AbortError";

/** "Copy result" does what it says: the text goes to the clipboard. Only if that write throws
 * (blocked, or no clipboard API) does the share sheet stand in, where the browser has one. A
 * dismissed sheet is "dismissed": the player chose not to share, so nothing is recorded or said. */
export async function copyResult(text: string): Promise<"copied" | "shared" | "dismissed" | "failed"> {
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    try {
      if (!navigator.share) return "failed";
      await navigator.share({ text });
      return "shared";
    } catch (e) {
      return isAbort(e) ? "dismissed" : "failed";
    }
  }
}

/** The player's share card, drawn in the browser (architecture §10): zero server time.
 * Spoiler-free, like the share text: depths only, no words. */
export async function shareImage(input: { number: number; score: number; tiers: (Tier | null)[]; text: string }): Promise<"shared" | "downloaded" | "dismissed" | "failed"> {
  try {
    // Fonts are a nicety: if they can't load (or the API is absent) the font stacks' fallbacks draw.
    await Promise.all([
      document.fonts?.load('700 72px "Libre Caslon Text"'),
      document.fonts?.load('400 40px "Work Sans"'),
    ]).catch(() => {});
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "failed";
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = INK;
    ctx.font = '700 64px "Libre Caslon Text", Georgia, serif';
    ctx.fillText("curio dig", 80, 140);
    ctx.font = '400 40px "Work Sans", system-ui, sans-serif';
    ctx.fillText(`day ${input.number}`, 80, 200);
    ctx.font = '700 96px "Libre Caslon Text", Georgia, serif';
    ctx.fillText(`${formatDepth(input.score)} down`, 80, 330);
    const top = 400, h = 600, w = SIZE - 160;
    const { bands, markers } = strataLayout(input.tiers, w, h);
    bands.forEach((b, i) => {
      ctx.fillStyle = STRATUM_HEX[i];
      ctx.fillRect(80, top + b.y, w, b.h);
      ctx.fillStyle = STRATUM_DARK[i] ? PAPER : INK;
      ctx.font = '400 26px "Work Sans", system-ui, sans-serif';
      ctx.fillText(STRATA[i], 96, top + b.y + 36);
    });
    markers.forEach((m, i) => {
      ctx.fillStyle = m.band !== null && STRATUM_DARK[m.band] ? PAPER : INK;
      ctx.beginPath();
      ctx.arc(80 + m.x, top + Math.max(m.y, 14), input.tiers[i] === "fossil" ? 26 : 16, 0, Math.PI * 2);
      ctx.fill();
    });
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return "failed";
    const name = `curio-dig-day-${input.number}.png`;
    if (typeof navigator.canShare === "function" && typeof File === "function") {
      const file = new File([blob], name, { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: input.text });
          return "shared";
        } catch (e) {
          // Dismissed: the player chose not to share. Any other share error falls through to a download.
          if (isAbort(e)) return "dismissed";
        }
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return "downloaded";
  } catch {
    return "failed";
  }
}
