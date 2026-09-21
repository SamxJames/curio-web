/** Reads lib/storage.ts's readSessionHint value BEFORE React hydrates and
 * sets a `data-signed-in` attribute on <html> so app/globals.css's
 * `signed-in:` variant can pick the right header nav labels on the very
 * first paint — the same pre-hydration trick ThemeInit uses for the theme
 * preference. A useSyncExternalStore-based hook can't do this: its server
 * snapshot still governs the first client render, so the hint would only
 * take effect a tick after hydration, which is exactly the flicker this
 * component exists to avoid. Display hint only — see readSessionHint's
 * doc comment in lib/storage.ts for why it must never gate anything
 * security-relevant. */
export default function SessionHintInit() {
  const script = `
    (function () {
      try {
        if (window.localStorage.getItem("curio:signedIn") === "1") {
          document.documentElement.setAttribute("data-signed-in", "");
        }
      } catch (e) {}
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
