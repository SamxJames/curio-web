import { absoluteUrl } from "../siteUrl";

/** The one-line dig invitation for the digest and the social posts. Pure: no
 * Redis, no fs, nothing from ./server, so email and social code can import it
 * safely. The server-side lookup is in ./digLine. */

export type DigLine = { prompt: string };

export type DigLineSource = "email" | "bluesky" | "threads" | "instagram" | "sample";

/** `Today's dig starts with “Name a beverage”. Seven prompts, about three
 * minutes.` The same for everyone: no count of people, no gap, no deadline. */
export function digLineText(prompt: string, opts: { short?: boolean } = {}): string {
  const first = `Today's dig starts with “${prompt}”.`;
  return opts.short ? first : `${first} Seven prompts, about three minutes.`;
}

/** /dig tagged with the channel's utm_source, so the existing land:<source>
 * funnel field credits the arrival. "sample" is intentionally not a tagged
 * traffic source (see app/sample-email/route.ts). */
export function digLineUrl(source: DigLineSource): string {
  const url = new URL(absoluteUrl("/dig"));
  url.searchParams.set("utm_source", source);
  url.searchParams.set("utm_medium", source === "email" || source === "sample" ? "email" : "social");
  url.searchParams.set("utm_campaign", "daily-dig");
  return url.toString();
}
