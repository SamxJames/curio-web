// Renders content/languages/review.html (scripts/languages/reviewPage.ts): one plain-text card
// per draft so the owner can check every field against its source before approving.
// Local-only tooling, so it uses its own inline CSS rather than the app's design system.
import { eraLabel, formatYear } from "./timeline";
import { validateSheet } from "./validate";

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const text = (v: unknown): string =>
  v === null || v === undefined ? "—" : typeof v === "string" ? v : JSON.stringify(v);

function eraText(era: unknown): string {
  if (era === null) return "dates unknown";
  if (!isObject(era) || !isNum(era.from) || !(era.to === null || isNum(era.to))) {
    return `malformed: ${text(era)}`;
  }
  let label = eraLabel({ from: era.from, to: era.to, approximate: era.approximate === true });
  if (era.writtenUntil === null) label += ", then in writing to today";
  else if (isNum(era.writtenUntil)) label += `, then in writing to ${formatYear(era.writtenUntil)}`;
  return label;
}

function speakersText(d: Obj): string {
  const ps = d.peakSpeakers;
  if (ps === null) return `Unknown — ${text(d.unknownSpeakersNote)}`;
  if (!isObject(ps) || !isNum(ps.count)) return `malformed: ${text(ps)}`;
  const year = isNum(ps.year) ? ` (${formatYear(ps.year)})` : "";
  const note = typeof ps.note === "string" ? ` — ${ps.note}` : "";
  return `${ps.count.toLocaleString("en-US")}${year}${note}`;
}

function mapText(map: unknown): string {
  if (map === null) return "none (no location in the facts)";
  if (!isObject(map)) return `malformed: ${text(map)}`;
  return `${text(map.lat)}, ${text(map.lon)} · ${text(map.radiusKm)} km`;
}

function card(raw: unknown, i: number): string {
  const d: Obj = isObject(raw) ? raw : {};
  const name = typeof d.name === "string" ? d.name : `(unnamed draft ${i + 1})`;
  const stored = Array.isArray(d._problems) ? d._problems.map(String) : [];
  const problems = [...new Set([...stored, ...validateSheet(raw)])];
  const aliases = Array.isArray(d.aliases) && d.aliases.length > 0 ? d.aliases.map(String).join(", ") : "—";
  const url = typeof d.sourceUrl === "string" ? d.sourceUrl : "";

  const rows: [string, string][] = [
    ["Status", text(d.status)],
    ["Classification", text(d.classification)],
    ["Region", text(d.region)],
    ["Map", mapText(d.map)],
    ["When", eraText(d.era)],
    ["Speakers at its peak", speakersText(d)],
    ["Parent", text(d.parent)],
    ["Aliases", aliases],
    ["Where it came from", text(d.origin)],
    ["Approved", d.approved === true ? "yes" : "no"],
  ];

  return `<article>
<h2>${escapeHtml(name)}</h2>
${
  problems.length > 0
    ? `<ul class="problems">${problems.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>`
    : ""
}<dl>
${rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join("\n")}
<dt>Source</dt><dd>${url ? `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>` : "—"}</dd>
</dl>
</article>`;
}

export function renderReviewPage(drafts: unknown[]): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Language drafts — review</title>
<style>
body { font: 16px/1.5 Georgia, serif; max-width: 46rem; margin: 2rem auto; padding: 0 1rem; color: #222; background: #faf8f4; }
article { background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 1rem 1.25rem; margin: 1.25rem 0; }
h2 { margin: 0 0 .5rem; }
dl { display: grid; grid-template-columns: 11rem 1fr; gap: .25rem 1rem; margin: 0; }
dt { color: #666; }
dd { margin: 0; }
.problems { color: #b00020; font-weight: bold; margin: 0 0 .75rem; padding-left: 1.25rem; }
</style>
</head>
<body>
<h1>Language drafts (${drafts.length})</h1>
<p>Edit the JSON in content/languages/drafts/, re-run <code>npm run languages:review</code>, then approve.</p>
${drafts.map(card).join("\n")}
</body>
</html>
`;
}
