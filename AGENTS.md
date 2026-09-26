<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Design system

Curio has a small, consolidated design token layer (`app/globals.css`'s `@theme inline` block — colors, type sizes, tracking, leading, container widths, motion) and a shared component primitive library (`components/ui/` — Button, IconButton, TextField, SegmentedControl, Eyebrow). Read `docs/design-system.md` before adding any new UI — new arbitrary Tailwind values (`text-[Npx]`, `tracking-[...]`, etc.) or a new hand-rolled `<button>`/`<input>` outside `components/ui/` should be treated as a regression, not a shortcut. `components/AdminDashboard.tsx` is the one deliberate exception (internal tooling, not part of this system).

## Product principle: archive, never backlog

Curio may let people *pull* any word — the story pages, the A–Z list and related-word links are fine. Curio must never *push* unread-ness. That rules out:

- counts of words not yet seen, or "X of 1,147";
- "you missed" messaging;
- streaks, or completion percentages;
- manufactured history for days a user didn't experience.

Test every future feature against this rule.
