/** The "Tomorrow:" line on the end screen is tomorrow's first prompt with its leading "Name "
 * removed: "Name a word from sailing" -> "a word from sailing". Prompt text is already public
 * (archive pages show it), and no answer or fossil data is involved. Null when the prompt does
 * not start with "Name " or nothing follows it. */
export function tomorrowHint(promptText: string): string | null {
  const m = /^\s*Name\s+(\S[\s\S]*)$/.exec(promptText);
  const rest = m?.[1].trim();
  return rest ? rest.replace(/\s+/g, " ") : null;
}
