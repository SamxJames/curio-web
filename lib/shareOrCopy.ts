"use client";

export type ShareOutcome = "shared" | "copied" | "dismissed" | "failed";

const isAbort = (e: unknown) => (e as { name?: string } | null)?.name === "AbortError";

/** Phones and tablets get the share sheet; a mouse or trackpad gets the clipboard. Pointer, not
 * user agent: iPadOS reports a desktop agent. */
export function prefersShareSheet(): boolean {
  if (typeof window === "undefined" || typeof navigator.share !== "function") return false;
  return !!window.matchMedia?.("(pointer: coarse)").matches;
}

async function viaSheet(text: string): Promise<"shared" | "dismissed" | null> {
  if (typeof navigator.share !== "function") return null;
  try {
    await navigator.share({ text });
    return "shared";
  } catch (e) {
    return isAbort(e) ? "dismissed" : null;
  }
}

async function viaClipboard(text: string): Promise<"copied" | null> {
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return null;
  }
}

/** Must be called directly from the tap handler: browsers only open a share sheet from a fresh
 * tap, so nothing may be awaited before this. "dismissed" means the player changed their mind:
 * say nothing and count nothing. */
export async function shareOrCopy(text: string): Promise<ShareOutcome> {
  const order = prefersShareSheet() ? [viaSheet, viaClipboard] : [viaClipboard, viaSheet];
  for (const attempt of order) {
    const r = await attempt(text);
    if (r) return r;
  }
  return "failed";
}
