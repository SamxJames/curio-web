/** The words on the two dig OG images, kept pure so the copy audit can read them. */
export const OG_DIG_TITLE = "curio dig";
export const OG_DIG_TAGLINE = "Seven prompts a day. Rarer words dig deeper.";

/** "curio dig, day N" for a finished past day, plain "curio dig" otherwise. */
export function ogDayTitle(dayNo: number | null): string {
  return dayNo === null ? OG_DIG_TITLE : `${OG_DIG_TITLE}, day ${dayNo}`;
}
