// wordfreq's English "large" list (data CC BY-SA 4.0, credit exactly "Robyn Speer").
// Format: msgpack [header, bucket0, bucket1, ...]; bucket i holds words at -i centibels,
// so zipf = 9 - i/100. A 40-line decoder instead of a dependency.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

function decode(buf: Buffer): unknown {
  let p = 0;
  const u8 = () => buf[p++];
  const u16 = () => { const v = buf.readUInt16BE(p); p += 2; return v; };
  const u32 = () => { const v = buf.readUInt32BE(p); p += 4; return v; };
  const str = (n: number) => { const s = buf.toString("utf8", p, p + n); p += n; return s; };
  const arr = (n: number) => { const a: unknown[] = new Array(n); for (let i = 0; i < n; i++) a[i] = read(); return a; };
  const map = (n: number) => { const o: Record<string, unknown> = {}; for (let i = 0; i < n; i++) { const k = read() as string; o[k] = read(); } return o; };
  function read(): unknown {
    const b = u8();
    if (b <= 0x7f) return b;
    if (b <= 0x8f) return map(b & 0x0f);
    if (b <= 0x9f) return arr(b & 0x0f);
    if (b <= 0xbf) return str(b & 0x1f);
    if (b >= 0xe0) return b - 256;
    switch (b) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xd9: return str(u8());
      case 0xda: return str(u16());
      case 0xdb: return str(u32());
      case 0xdc: return arr(u16());
      case 0xdd: return arr(u32());
      case 0xde: return map(u16());
      case 0xdf: return map(u32());
      case 0xcc: return u8();
      case 0xcd: return u16();
      case 0xce: return u32();
      case 0xd0: return buf.readInt8(p++);
      case 0xd1: { const v = buf.readInt16BE(p); p += 2; return v; }
      case 0xd2: { const v = buf.readInt32BE(p); p += 4; return v; }
      default: throw new Error(`unsupported msgpack byte 0x${b.toString(16)}`);
    }
  }
  return read();
}

export function parseWordfreq(msgpack: Buffer): Map<string, number> {
  const [header, ...buckets] = decode(msgpack) as [{ format?: string }, ...string[][]];
  if (!header || header.format !== "cB") throw new Error("unexpected wordfreq header");
  const zipf = new Map<string, number>();
  buckets.forEach((words, i) => {
    for (const w of words) zipf.set(w, 9 - i / 100);
  });
  return zipf;
}

export function loadWordfreq(path: string): Map<string, number> {
  return parseWordfreq(gunzipSync(readFileSync(path)));
}
