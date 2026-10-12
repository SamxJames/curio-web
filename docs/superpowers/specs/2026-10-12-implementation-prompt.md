# Implementation prompt: language pages (2026-10-12)

Paste everything below the line into a fresh Claude Code session opened in `curio-web`.

---

Build Curio's "Words from {language}" pages, as specified in
`docs/superpowers/specs/2026-10-12-language-pages-design.md`. That spec was approved by Sam on 2026-10-12. Don't
reopen its decisions; if something in it turns out to be wrong or impossible, stop and tell me what and why.

**Read first, in this order:**
1. `handover.md` (short; the gotchas section has bitten before).
2. `AGENTS.md`: this Next.js version differs from your training data, so read the relevant guide in
   `node_modules/next/dist/docs/` before touching routes or metadata. "Archive, never backlog" applies.
3. The spec above.
4. `docs/design-system.md` before writing any UI.
5. `docs/handover/language-panel.md` for the sheet data model (skim; you need the `LanguageSheet` shape and the
   approved/alias rules, not the pipeline).

**Code you'll touch or reuse:** `lib/languages/{data,sheetIndex,lookup,panel,facts,timeline}.ts`,
`components/LanguagePanel.tsx`, `components/EtymologyLineage.tsx`, `components/StoryView.tsx`,
`app/story/[slug]/page.tsx` (pattern for static routes + JSON-LD), `app/words/page.tsx`, `lib/seoRoutes.ts`,
`lib/storyJsonLd.ts`.

**Process (superpowers):**
1. `writing-plans`: write the plan to `docs/superpowers/plans/2026-10-12-language-pages.md`, as small TDD tasks.
2. `subagent-driven-development` in a git worktree off `master`.
3. `requesting-code-review` on the branch.
4. `verification-before-completion`: run every check in the spec's Testing section, plus a clean `npm ci`,
   `npm run lint`, `npx vitest run` and `npm run build`. Show the build's route list with `/language/[slug]`
   prerendered (57+ pages), and confirm the language page's client JS doesn't include `lib/languages/data.ts` or
   `lib/words.ts`.
5. `finishing-a-development-branch`: merge to `master` locally.
6. `release-manager`: pushing `master` deploys to production. Verify on https://curioword.com using the spec's
   "Production after deploy" checks before calling it live.

**Hard rules:**
- Never hand-edit `lib/languages/data.ts` or `lib/languages/sheetIndex.ts` (generated).
- Client components may only `import type` from `lib/words.ts` and must not import `lib/languages/data.ts`.
- No per-reader state on these pages. No new arbitrary Tailwind values; use tokens and `components/ui/`.
- Local dev uses production's Upstash, but these pages are static and shouldn't touch Redis. If anything you add
  does, stop and ask.
- No Python on this machine. Any script is Node/tsx.
- Clean up at the end: stop dev servers, `rm -rf .next`, remove the merged worktree.

**When done:** update `handover.md` (Current state / Open threads; replace, don't append), add a dated entry to
`docs/handover/history.md`, and report back with what shipped, the production evidence, and anything deferred.
