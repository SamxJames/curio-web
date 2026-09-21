/** Sets `data-server-session` on `<html>` to "in" or "out" from the session
 * the server already resolved, before React hydrates — the same
 * pre-hydration trick components/ThemeInit.tsx uses for the theme
 * preference.
 *
 * `/` is the only arrival route (see components/HomeContent.tsx) and its
 * page already calls auth() itself, so it already knows the session
 * server-side at zero extra cost — unlike the root layout, which
 * deliberately does NOT call auth() (see lib/storage.ts's readSessionHint
 * doc comment for why). Having this on `/` lets
 * lib/useShowArrival.ts's arrival-or-not decision happen right after
 * hydration instead of waiting on useSession()'s client-side
 * /api/auth/session fetch to resolve, which is what let a genuine
 * first-time anonymous visitor see the normal header + TodayHero flash
 * before flipping to the arrival hero.
 *
 * Only ever consulted while useSession() reports "loading" — once it
 * resolves to "authenticated" or "unauthenticated", that (live, real)
 * status wins and this attribute is ignored. */
export default function ServerSessionMarker({ signedIn }: { signedIn: boolean }) {
  const script = `
    (function () {
      try {
        document.documentElement.setAttribute("data-server-session", ${JSON.stringify(
          signedIn ? "in" : "out"
        )});
      } catch (e) {}
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
