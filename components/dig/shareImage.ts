"use client";

import { CHALLENGE_HOOK } from "@/lib/dig/share";
import { formatDepth } from "@/lib/dig/score";
import { STRATA, STRATUM_DARK, STRATUM_HEX, strataLayout } from "@/lib/dig/strata";
import type { Tier } from "@/lib/dig/types";

const SIZE = 1080;
const INK = "#1C1A17", PAPER = "#F5F1E8";

/** Every string the share card draws, in order: the card text is built here so the copy audit can read it. */
export function shareImageLines(number: number, score: number, challenge = false): string[] {
  return ["curio dig", `day ${number}`, `${formatDepth(score)} down`, ...STRATA, ...(challenge ? [CHALLENGE_HOOK] : [])];
}

const isAbort = (e: unknown) => (e as { name?: string } | null)?.name === "AbortError";

type ImageInput = { number: number; score: number; tiers: (Tier | null)[]; text: string; challenge?: boolean };

/** The player's share card, drawn in the browser (architecture §10): zero server time.
 * Spoiler-free, like the share text: depths only, no words. Done ahead of the tap by EndScreen:
 * fonts and toBlob take long enough that a browser can refuse a share sheet opened after them. */
export async function renderShareImage(input: Omit<ImageInput, "text">): Promise<Blob | null> {
  // Fonts are a nicety: if they can't load (or the API is absent) the font stacks' fallbacks draw.
  await Promise.all([
    document.fonts?.load('700 72px "Libre Caslon Text"'),
    document.fonts?.load('400 40px "Work Sans"'),
  ]).catch(() => {});
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = INK;
  ctx.font = '700 64px "Libre Caslon Text", Georgia, serif';
  const lines = shareImageLines(input.number, input.score);
  ctx.fillText(lines[0], 80, 140);
  ctx.font = '400 40px "Work Sans", system-ui, sans-serif';
  ctx.fillText(lines[1], 80, 200);
  ctx.font = '700 96px "Libre Caslon Text", Georgia, serif';
  ctx.fillText(lines[2], 80, 330);
  const top = 400, h = 600, w = SIZE - 160;
  // Like components/dig/Strata: names in a left gutter, unanswered prompts as open rings.
  const gutter = 150;
  const { bands, markers } = strataLayout(input.tiers, w - gutter, h);
  bands.forEach((b, i) => {
    ctx.fillStyle = STRATUM_HEX[i];
    ctx.fillRect(80, top + b.y, w, b.h);
    ctx.fillStyle = STRATUM_DARK[i] ? PAPER : INK;
    ctx.font = '400 26px "Work Sans", system-ui, sans-serif';
    ctx.fillText(STRATA[i], 100, top + b.y + 40);
  });
  markers.forEach((m, i) => {
    const x = 80 + gutter + m.x;
    ctx.beginPath();
    if (m.band === null) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.arc(x, top + 22, 10, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    ctx.fillStyle = STRATUM_DARK[m.band] ? PAPER : INK;
    ctx.arc(x, top + m.y, input.tiers[i] === "fossil" ? 26 : 16, 0, Math.PI * 2);
    ctx.fill();
  });
  if (input.challenge) {
    ctx.fillStyle = INK;
    ctx.font = '400 40px "Work Sans", system-ui, sans-serif';
    ctx.fillText(CHALLENGE_HOOK, 80, 1050);
  }
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
}

export async function shareImage(input: ImageInput, ready?: Blob | null): Promise<"shared" | "downloaded" | "dismissed" | "failed"> {
  try {
    const blob = ready ?? (await renderShareImage(input));
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
