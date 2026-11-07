/**
 * Disclaimers the generation pipeline left in reader-facing story text
 * ("the facts here don't name them specifically", "no cognate is given in the record").
 * Removed at render time; the data in lib/words.ts is left as is.
 * Pure and client-safe: it must not import values from lib/words.ts.
 *
 * Strategy, per sentence: split into clauses, find the first clause that talks about the
 * source material instead of the word, then either
 *  - cut it and everything after it (a trailing disclaimer; the lead stands alone), or
 *  - when the sentence opens with it, keep the very next clause only if that clause reads
 *    as a complete sentence on its own, otherwise drop the whole sentence.
 * Dropping is always preferred over leaving a fragment.
 */

// A clause that talks about the source material instead of the word.
const DISCLAIMER = new RegExp(
  [
    // "the facts here don't…", "the given facts", "given only the facts above", "these facts" (but not "the facts of the matter")
    String.raw`\b(?:the|these|those) (?:(?:given|available|source|provided) )?facts\b(?! (?:of|about|behind)\b)`,
    String.raw`\b(?:given|available|provided|source) facts\b|\bfacts (?:given|available|here|at hand|on hand|above)\b`,
    String.raw`\b(?:given|named|recorded) (?:here|in the (?:record|sources?))\b`, // "isn't given here"
    String.raw`\bno\b[^.!?;—]{0,70}?\b(?:is|are) (?:given|named|recorded)\b`, // "no cognate is given"
    String.raw`\bsource (?:material|text)\b`,
    String.raw`\b(?:given|available|provided) sources?\b|\b(?:in|from|by) the (?:record|sources)\b`,
  ].join("|"),
  "i",
);

// Contrast connectors that open a clause which still carries real content ("…, but the root verb…").
const CONNECTOR = /^(?:though|although|but|yet|while|whereas)\s+/i;
// A clause starting like this is a fragment (or leans on the removed clause), not a sentence.
const FRAGMENT =
  /^(?:only|just|beyond|rather|with|without|no|nor|nothing|simply|merely|through|as|a|an|and|so|then|instead|except|apart|which|they|their|these|those|both|that|such|the \w+ being)\b/i;
// "fitting associations…", "carried directly…": a participle opener is a fragment.
const PARTICIPLE_OPENER = /^["'“‘(]?\w+(?:ing|ed)\b/i;
// A disclaimer clause that says something positive ("the facts point to X") carries content;
// only a negative one is pure hedging.
const NEGATIVE = /n't\b|\bnot\b|\bno\b|\bnone\b|\bonly\b|\bnor\b|\bnever\b|\bwithout\b/i;
// A clause hanging off a removed one ("so none can be named", "so the honest story is simple:").
const DEPENDENT = /^so\b/i;
const HONEST_THAT = /^so\b[^]*?\b(?:honest|safest)\b[^]*?\b(?:is|say)(?: (?:simply|only|just))? that\s+([^]+)$/i;
const VERBISH = new RegExp(
  String.raw`\b(?:is|are|was|were|be|been|has|have|had|isn't|aren't|can|could|may|might|would|will|did|does|seems?|appears?|stands?|runs?|comes?|came|becomes?|became|arrived|entered|passed|kept|took|means?|meant|carr(?:ies|ied|y)|names?|links?|ties|traces?|shows?|points?|began|starts?|gave|gives?|shares?|stay(?:s|ed)|remain(?:s|ed)|shift(?:s|ed)|moves?|moved|describes?|uses?|borrow(?:s|ed)|adopt(?:s|ed)|named|used|derived|formed|built|forms?|descends?|hints?|suggests?|keeps?|survives?|owes?|reads?|sits?|makes?|made|goes|went|refers?|denotes?|replaced|replaces|turns?|grew|grows?|settles?|crosses?|reached|calls?|spreads?|retains?|reflects?|echoes?|sounds?|works?|plays?|marks?|lends?|lent|stuck|sticks?|simply)\b`,
  "i",
);

// Strong breaks (dash, semicolon, colon) and weak ones (a comma before a connector).
const BREAK = /(\s*—\s*|\s*;\s*|\s*:\s+|,(["'”’)]*)\s+(?=(?:though|although|but|yet|and|while|whereas|so|with|without|only|just|since|because|which)\b))/i;

function splitSentences(s: string): string[] {
  return s.match(/[^.!?]+(?:[.!?]+["'”’)\]]*\s*|$)/g) ?? [s];
}

function capitalize(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function closeSentence(t: string, quoteAfterComma: string): string {
  const out = t.replace(/[\s,;:—]+$/, "");
  if (/[.!?]["'”’)\]]*$/.test(out)) return out;
  const q = out.match(/["'”’)]+$/)?.[0];
  // American-style quotes ("stingo," though …): the full stop sits inside the closing quote.
  if (quoteAfterComma && q) return out.slice(0, -q.length) + "." + q;
  return out + ".";
}

/** Can this clause stand as a sentence of its own once the disclaimer before it is gone? */
function standsAlone(c: string): boolean {
  return !FRAGMENT.test(c) && !PARTICIPLE_OPENER.test(c) && VERBISH.test(c) && /[A-Za-z]/.test(c);
}

function cleanSentence(sentence: string): string {
  const raw = sentence.trim();
  if (!DISCLAIMER.test(raw)) return raw;

  // Terminal punctuation travels with the final clause; split it off first.
  const tail = raw.match(/[.!?]+["'”’)\]]*$/)?.[0] ?? "";
  const body = tail ? raw.slice(0, -tail.length) : raw;

  // split() with capture groups interleaves [clause, delimiter, quote, clause, delimiter, quote, …].
  const parts = body.split(BREAK);
  const clauses: string[] = [];
  const delims: string[] = [];
  const quotes: string[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    clauses.push(parts[i]);
    if (parts[i + 1] !== undefined) {
      delims.push(parts[i + 1]);
      quotes.push(parts[i + 2] ?? "");
    }
  }

  const first = clauses.findIndex((c) => DISCLAIMER.test(c));
  if (first === -1) return raw;

  if (first > 0) {
    // Trailing disclaimer: keep the lead, drop the rest.
    const lead = clauses.slice(0, first).reduce((acc, c, i) => acc + (i ? delims[i - 1] : "") + c, "");
    if (!/[A-Za-z]/.test(lead)) return "";
    return closeSentence(lead + quotes[first - 1], quotes[first - 1]);
  }

  // Leading disclaimer. A sentence that brackets its disclaimer with two dashes is too tangled to repair.
  if (delims.filter((d) => d.includes("—")).length > 1) return "";
  if (clauses.length < 2) return "";

  let next = 1;
  let c = clauses[next].trim();
  if (DEPENDENT.test(c)) {
    // "…, so the honest story is simply that the word crossed X." keeps what follows "that".
    const that = c.match(HONEST_THAT);
    if (that) {
      c = that[1];
    } else if (delims[next]?.includes(":")) {
      // "…, so the honest story is simple: Latin X passed into English." keeps what follows the colon.
      next++;
      c = clauses[next]?.trim() ?? "";
    } else {
      return "";
    }
  }
  if (!c || DISCLAIMER.test(c)) return "";
  // A positive facts-clause ("The facts describe a separate word history: …") can only lead into a colon.
  if (!NEGATIVE.test(clauses[0]) && !delims[0].includes(":")) return "";

  c = c.replace(CONNECTOR, "");
  if (!standsAlone(c)) return "";

  // Rebuild the rest of the sentence from here, stopping at any later disclaimer.
  let rest = c;
  let reachedEnd = true;
  for (let j = next + 1; j < clauses.length; j++) {
    if (DISCLAIMER.test(clauses[j]) || DEPENDENT.test(clauses[j].trim())) {
      reachedEnd = false;
      break;
    }
    rest += delims[j - 1] + clauses[j];
  }
  const out = capitalize(rest.trim());
  // Reached the end of the sentence: keep its original closing punctuation and quotes.
  return reachedEnd && tail ? out + tail : closeSentence(out, "");
}

export function cleanStoryText(s: string): string {
  if (!DISCLAIMER.test(s)) return s;
  return splitSentences(s)
    .map(cleanSentence)
    .filter(Boolean)
    .join(" ")
    .trim();
}
