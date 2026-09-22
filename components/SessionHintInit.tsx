import { SESSION_HINT_KEY } from "@/lib/sessionHintKey";

/** Reads lib/storage.ts's readSessionHint value BEFORE React hydrates and
 * sets a `data-signed-in` attribute on <html> so app/globals.css's
 * `signed-in:` variant can pick the right header nav labels on the very
 * first paint — the same pre-hydration trick ThemeInit uses for the theme
 * preference. Display hint only — see readSessionHint's doc comment in
 * lib/storage.ts for why it must never gate anything security-relevant. */
export default function SessionHintInit() {
  const script = `
    (function () {
      try {
        if (window.localStorage.getItem(${JSON.stringify(SESSION_HINT_KEY)}) === "1") {
          document.documentElement.setAttribute("data-signed-in", "");
        }
      } catch (e) {}
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
