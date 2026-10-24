/** How guesses and answers are compared. Shared by the browser game and the pipeline's
 * validator, so the validator tests exactly what players run. Pure: no Node APIs. */

const LIGATURES: Record<string, string> = { æ: "ae", œ: "oe", ß: "ss", ø: "o", ð: "d", þ: "th", ł: "l" };

/** Lowercase, fold ligatures and accents, drop a leading article, keep letters only.
 * "the Hurdy-Gurdy" → "hurdygurdy", "Crème brûlée" → "cremebrulee". */
export function normalizeKey(raw: string): string {
  let s = raw.toLowerCase().trim();
  s = s.replace(/[æœßøðþł]/g, (c) => LIGATURES[c]);
  s = s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/^(a|an|the)\s+/, "");
  return s.replace(/[^a-z]/g, "");
}

/** The key itself, then plural-stripped forms (-ies → -y, then drop -es, then drop -s),
 * without duplicates. "berries" → berries, berry, berri, berrie: look-ups stop at the
 * first form that hits, so the extra forms are harmless. Irregular plurals come from the
 * pipeline as aliases instead. */
export function guessForms(key: string): string[] {
  const forms = [key];
  if (key.length > 4 && key.endsWith("ies")) forms.push(key.slice(0, -3) + "y");
  if (key.length > 3 && key.endsWith("es")) forms.push(key.slice(0, -2));
  if (key.length > 3 && key.endsWith("s") && !key.endsWith("ss")) forms.push(key.slice(0, -1));
  return [...new Set(forms)];
}
