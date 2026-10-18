import { resolve } from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // Mirrors tsconfig.json's "@/*" -> "./*" path mapping. Vitest doesn't read
  // tsconfig paths on its own, so without this a test can't import anything
  // under app/ or components/ (which use the alias throughout) — that gap is
  // why SessionHintInit's inline script went unverified until it broke in
  // production. lib/ tests keep using relative imports; both work.
  resolve: {
    alias: {
      // __dirname rather than import.meta.url: this config is loaded as
      // CommonJS, and ESM-only syntax here triggers a Vite warning that
      // would pollute every test run's output.
      "@": resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    // Worktrees live under .claude/worktrees/ and carry their own copy of the
    // suite; sweeping them from the main checkout reports bogus failures.
    exclude: [...configDefaults.exclude, ".claude/**"],
  },
});
