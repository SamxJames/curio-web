// Approves reviewed drafts and rewrites lib/languages/data.ts. Refuses any draft that has
// `_problems` or fails validateSheet.
//   npm run languages:approve -- --all-valid
//   npm run languages:approve -- --only "Latin,Old French"
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { approveSheets, renderDataModule, type ApproveSelection } from "../../lib/languages/approve";
import { LANGUAGE_SHEETS } from "../../lib/languages/data";
import { canonicalName } from "../../lib/languages/facts";
import { DRAFTS_DIR, jsonFiles, onlyList } from "./cli";

const DATA_FILE = path.join("lib", "languages", "data.ts");

function main() {
  const args = process.argv.slice(2);
  const only = onlyList(args);
  let select: ApproveSelection;
  if (args.includes("--all-valid")) select = { allValid: true };
  else if (only && only.length > 0) select = { only };
  else {
    console.error('Usage: npm run languages:approve -- --all-valid | --only "Latin,Old French"');
    process.exit(1);
  }
  if (!existsSync(DRAFTS_DIR)) throw new Error(`No ${DRAFTS_DIR} — nothing to approve.`);

  const files = jsonFiles(DRAFTS_DIR, readdirSync(DRAFTS_DIR));
  const drafts = files.map((f): unknown => {
    try {
      return JSON.parse(readFileSync(f, "utf-8"));
    } catch {
      return { name: path.basename(f), _problems: ["file is not valid JSON"] };
    }
  });

  const result = approveSheets(drafts, LANGUAGE_SHEETS, select);
  for (const r of result.refused) console.log(`REFUSED ${r.name}: ${r.reasons.join("; ")}`);
  for (const m of result.missing) console.log(`NO DRAFT for ${m}`);
  const hadTrouble = result.refused.length > 0 || result.missing.length > 0;

  if (result.approved.length === 0) {
    console.log(`Nothing approved — ${DATA_FILE} unchanged.`);
    process.exit(hadTrouble ? 1 : 0);
  }

  writeFileSync(DATA_FILE, renderDataModule(result.sheets));
  // Mark approved drafts so the review page shows them as done.
  const approved = new Set(result.approved);
  files.forEach((f, i) => {
    const d = drafts[i] as { name?: unknown } | null;
    if (d && typeof d.name === "string" && approved.has(canonicalName(d.name))) {
      writeFileSync(f, JSON.stringify({ ...d, approved: true }, null, 2) + "\n");
    }
  });
  console.log(
    `Approved ${result.approved.length}: ${result.approved.join(", ")}. ` +
      `${DATA_FILE} now has ${result.sheets.length} sheet(s).`,
  );
  console.log(`Next: npx vitest run lib/languages && git diff ${DATA_FILE}`);
  if (hadTrouble) process.exitCode = 1;
}

main();
