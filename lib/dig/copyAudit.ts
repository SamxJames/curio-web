export const BANNED = /streak|missed|you didn't|haven't|come back|in a row|\bplayed\b|countdown|opens in|hours left|don't break|catch up|unplayed|not done|\b\d+ of \d+\b|%|most people|everyone|nobody else/g;

export function auditText(rendered: string): string {
  return rendered
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;|&#39;|&#x2019;|&rsquo;|’/g, "'")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ").trim().toLowerCase()
    .replace(/prompt \d of 7/g, "")
    .replace(/deeper than \d+% of today's diggers/g, "");
}
export function bannedHits(rendered: string): string[] {
  return rendered ? (auditText(rendered).match(BANNED) ?? []) : [];
}
