/** Every Redis key the dig game uses (architecture.md §8). Prefix curio:dig: only. */
export const digKeys = {
  day: (date: string) => `curio:dig:day:${date}`,
  manifest: "curio:dig:manifest",
  /** promptId → accepted-only words added by adjudication */
  extras: "curio:dig:extras",
  /** "promptId|word" decisions already made, so a guess is judged once */
  adjudicated: "curio:dig:adjudicated",
  scores: (date: string) => `curio:dig:scores:${date}`,
  funnel: (date: string) => `curio:dig:funnel:${date}`,
  rejected: (date: string, index: number) => `curio:dig:rej:${date}:${index}`,
  claims: (date: string, index: number) => `curio:dig:claim:${date}:${index}`,
  heartbeat: "curio:dig:health:last",
  /** highest usage alert threshold already sent this month (50 or 70) */
  usageAlert: (month: string) => `curio:dig:health:usage:${month}`,
} as const;

export type ManifestPrompt = { id: string; base: string; fossil: string; languages?: string[] };
export type DigManifest = {
  v: 1;
  lastRun: string;
  /** every built date → its prompts, for cooldowns and the past list */
  days: Record<string, ManifestPrompt[]>;
  poolThemes: number;
  poolOrigins: number;
};

export function historyFromManifest(m: DigManifest | null): { date: string; prompts: ManifestPrompt[] }[] {
  if (!m) return [];
  return Object.entries(m.days).sort(([a], [b]) => a.localeCompare(b)).map(([date, prompts]) => ({ date, prompts }));
}
