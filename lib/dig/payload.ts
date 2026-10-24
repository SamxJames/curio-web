import type { DigDay, DigDayPlain, DigPrompt, DigPromptPlain, PromptSecret } from "./types";

/* A spoiler guard, not security (architecture.md §5): anyone who finishes a day sees its
 * answers, and future days never leave Redis. A letter rotation keeps the JSON
 * compressible, which XOR + base64 would not. */

function shiftFor(date: string, id: string): number {
  let h = 5381;
  const s = `${date}|${id}`;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return (h % 25) + 1;
}

function rotate(s: string, by: number): string {
  return s.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + by) % 26) + base);
  });
}

export function encodeSecret(secret: PromptSecret, date: string, id: string): string {
  return rotate(JSON.stringify(secret), shiftFor(date, id));
}

export function decodeSecret(payload: string, date: string, id: string): PromptSecret {
  return JSON.parse(rotate(payload, 26 - shiftFor(date, id))) as PromptSecret;
}

export function encodeDay(day: DigDayPlain): DigDay {
  return {
    v: day.v,
    date: day.date,
    rejSample: day.rejSample,
    prompts: day.prompts.map((p): DigPrompt => {
      const { id, kind, text, ...secret } = p;
      return { id, kind, text, payload: encodeSecret(secret, day.date, id) };
    }),
  };
}

export function decodeDay(day: DigDay): DigDayPlain {
  return {
    v: day.v,
    date: day.date,
    rejSample: day.rejSample,
    prompts: day.prompts.map(
      (p): DigPromptPlain => ({ id: p.id, kind: p.kind, text: p.text, ...decodeSecret(p.payload, day.date, p.id) })
    ),
  };
}
