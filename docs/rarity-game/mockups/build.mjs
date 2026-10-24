// Inlines _src/shared.js into each option template so every mockup is one
// self-contained HTML file that opens straight from disk.
// Usage: node docs/rarity-game/mockups/build.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const shared = readFileSync(join(here, "_src/shared.js"), "utf8");
const mockCss = `
.mock-jump{position:fixed;right:12px;bottom:12px;z-index:50;font:13px/1.3 system-ui,sans-serif;color:#1C1A17;max-width:calc(100vw - 24px)}
.mock-jump summary{cursor:pointer;list-style:none;background:#fff;border:1px dashed #1C1A17;border-radius:999px;padding:8px 14px;box-shadow:0 2px 8px rgba(0,0,0,.15)}
.mock-jump summary::-webkit-details-marker{display:none}
.mock-jump[open] summary{border-radius:12px 12px 0 0}
.mock-jump div{display:grid;gap:2px;background:#fff;border:1px dashed #1C1A17;border-top:0;padding:8px;border-radius:0 0 12px 12px}
.mock-jump button,.mock-jump a{all:unset;cursor:pointer;padding:6px 8px;border-radius:6px;color:#1C1A17}
.mock-jump button:hover,.mock-jump a:hover{background:#eee}
.mock-jump button:focus-visible,.mock-jump a:focus-visible,.mock-jump summary:focus-visible{outline:2px solid #1C1A17;outline-offset:2px}
`;

const options = [
  ["_src/option-1-quiet.html", "option-1-quiet.html"],
  ["_src/option-2-dig.html", "option-2-dig.html"],
  ["_src/option-3-dive.html", "option-3-dive.html"],
];

for (const [src, out] of options) {
  let html;
  try { html = readFileSync(join(here, src), "utf8"); } catch { continue; }
  html = html.replace("/*@SHARED*/", () => shared).replace("/*@MOCKCSS*/", () => mockCss);
  writeFileSync(join(here, out), html);
  console.log("built", out);
}
