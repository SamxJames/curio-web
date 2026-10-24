// Loads wordfreq's cBpack (msgpack, gzipped) into Map<word, zipf>. No dependencies.
// Format: [header, bucket0, bucket1, ...]; bucket i holds words at -i centibels,
// i.e. frequency 10^(-i/100), so zipf = 9 - i/100.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

function decode(buf) {
  let p = 0;
  const u8 = () => buf[p++];
  const u16 = () => { const v = buf.readUInt16BE(p); p += 2; return v; };
  const u32 = () => { const v = buf.readUInt32BE(p); p += 4; return v; };
  const str = (n) => { const s = buf.toString("utf8", p, p + n); p += n; return s; };
  const arr = (n) => { const a = new Array(n); for (let i = 0; i < n; i++) a[i] = read(); return a; };
  const map = (n) => { const o = {}; for (let i = 0; i < n; i++) { const k = read(); o[k] = read(); } return o; };
  function read() {
    const b = u8();
    if (b <= 0x7f) return b;
    if (b >= 0x80 && b <= 0x8f) return map(b & 0x0f);
    if (b >= 0x90 && b <= 0x9f) return arr(b & 0x0f);
    if (b >= 0xa0 && b <= 0xbf) return str(b & 0x1f);
    if (b >= 0xe0) return b - 256;
    switch (b) {
      case 0xc0: return null; case 0xc2: return false; case 0xc3: return true;
      case 0xd9: return str(u8()); case 0xda: return str(u16()); case 0xdb: return str(u32());
      case 0xdc: return arr(u16()); case 0xdd: return arr(u32());
      case 0xde: return map(u16()); case 0xdf: return map(u32());
      case 0xcc: return u8(); case 0xcd: return u16(); case 0xce: return u32();
      case 0xd0: return buf.readInt8(p++); case 0xd1: { const v = buf.readInt16BE(p); p += 2; return v; }
      case 0xd2: { const v = buf.readInt32BE(p); p += 4; return v; }
      default: throw new Error("unsupported msgpack byte 0x" + b.toString(16));
    }
  }
  return read();
}

export function loadWordfreq(path) {
  const data = decode(gunzipSync(readFileSync(path)));
  const [header, ...buckets] = data;
  if (!header || header.format !== "cB") throw new Error("unexpected wordfreq header " + JSON.stringify(header));
  const zipf = new Map();
  buckets.forEach((words, i) => { for (const w of words) zipf.set(w, 9 - i / 100); });
  return zipf;
}

if (process.argv[1] && process.argv[1].endsWith("wordfreq.mjs")) {
  const z = loadWordfreq(process.argv[2]);
  console.log("words:", z.size);
  for (const w of ["the", "sail", "mast", "keel", "rudder", "skipper", "dinghy", "flotilla", "halyard", "gunwale", "bowsprit", "binnacle", "tabby", "nadir", "chinois", "haar", "sackbut", "gamboge", "colour", "color", "petrichor"])
    console.log(w.padEnd(10), z.has(w) ? z.get(w).toFixed(2) : "—");
}
